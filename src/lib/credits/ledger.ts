import type { CreditLedgerEntry, CreditReservation, CreditWallet } from "@/lib/core/types";
import type { Store } from "@/lib/db/store";
import { newId, nowIso } from "@/lib/core/ids";
import { CREDIT_EXPIRY, PLANS, type PlanKey } from "@/config/pricing";

/**
 * ワークトークン台帳。
 *
 * 原則:
 *  - 台帳は追記のみ。残高は wallet に保持しつつ、台帳の整合で検証できる。
 *  - 実行前に reserve、完了後に settle（実使用）、失敗時は release。
 *  - idempotencyKey により、リトライで二重課金しない。
 */

export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number,
  ) {
    super(`ワークトークンが不足しています（必要: ${required} / 利用可能: ${available}）`);
    this.name = "InsufficientCreditsError";
  }
}

export async function getWallet(store: Store, orgId: string): Promise<CreditWallet> {
  const wallets = await store.list("credit_wallets", orgId);
  const existing = wallets[0];
  if (existing) return existing;
  const wallet: CreditWallet = {
    id: newId(),
    organizationId: orgId,
    balance: 0,
    reserved: 0,
    updatedAt: nowIso(),
  };
  return store.insert("credit_wallets", wallet);
}

export function availableBalance(wallet: CreditWallet): number {
  return Math.max(0, wallet.balance - wallet.reserved);
}

async function appendLedger(
  store: Store,
  entry: Omit<CreditLedgerEntry, "id" | "createdAt">,
): Promise<CreditLedgerEntry> {
  return store.insert("credit_ledger", {
    ...entry,
    id: newId(),
    createdAt: nowIso(),
  });
}

/** 月次付与 */
export async function grantMonthly(
  store: Store,
  orgId: string,
  planKey: PlanKey,
  idempotencyKey: string,
): Promise<CreditWallet> {
  return store.withOrgLock(orgId, async () => {
    const existing = await store.list("credit_ledger", orgId, {
      filter: { idempotencyKey },
    });
    const wallet = await getWallet(store, orgId);
    if (existing.length > 0) return wallet;

    const amount = PLANS[planKey].monthlyWorkTokens;
    const updated = await store.update("credit_wallets", orgId, wallet.id, {
      balance: wallet.balance + amount,
    });
    await appendLedger(store, {
      organizationId: orgId,
      type: "grant",
      bucket: "monthly",
      amount,
      balanceAfter: updated.balance,
      taskId: null,
      employeeId: null,
      reservationId: null,
      idempotencyKey,
      note: `${PLANS[planKey].name} プランの月次付与`,
      expiresAt: new Date(
        Date.now() + CREDIT_EXPIRY.monthlyGrantExpiresInDays * 86_400_000,
      ).toISOString(),
    });
    return updated;
  });
}

/** 追加購入 */
export async function purchasePack(
  store: Store,
  orgId: string,
  workTokens: number,
  idempotencyKey: string,
  note = "追加購入",
): Promise<CreditWallet> {
  return store.withOrgLock(orgId, async () => {
    const existing = await store.list("credit_ledger", orgId, { filter: { idempotencyKey } });
    const wallet = await getWallet(store, orgId);
    if (existing.length > 0) return wallet;

    const updated = await store.update("credit_wallets", orgId, wallet.id, {
      balance: wallet.balance + workTokens,
    });
    await appendLedger(store, {
      organizationId: orgId,
      type: "purchase",
      bucket: "purchased",
      amount: workTokens,
      balanceAfter: updated.balance,
      taskId: null,
      employeeId: null,
      reservationId: null,
      idempotencyKey,
      note,
      expiresAt: new Date(
        Date.now() + CREDIT_EXPIRY.purchasedPackExpiresInDays * 86_400_000,
      ).toISOString(),
    });
    return updated;
  });
}

export interface ReserveInput {
  orgId: string;
  taskId: string | null;
  employeeId: string | null;
  amount: number;
  idempotencyKey: string;
}

/**
 * 実行前の予約。
 * 同じ idempotencyKey での再呼び出しは、既存の予約をそのまま返す（二重課金防止）。
 */
export async function reserve(store: Store, input: ReserveInput): Promise<CreditReservation> {
  return store.withOrgLock(input.orgId, async () => {
    const existing = await store.list("credit_reservations", input.orgId, {
      filter: { idempotencyKey: input.idempotencyKey },
    });
    const found = existing[0];
    if (found) return found;

    const wallet = await getWallet(store, input.orgId);
    const available = availableBalance(wallet);
    if (available < input.amount) {
      throw new InsufficientCreditsError(input.amount, available);
    }

    const updated = await store.update("credit_wallets", input.orgId, wallet.id, {
      reserved: wallet.reserved + input.amount,
    });

    const reservation: CreditReservation = {
      id: newId(),
      organizationId: input.orgId,
      taskId: input.taskId,
      employeeId: input.employeeId,
      amount: input.amount,
      settledAmount: null,
      status: "reserved",
      idempotencyKey: input.idempotencyKey,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await store.insert("credit_reservations", reservation);

    await appendLedger(store, {
      organizationId: input.orgId,
      type: "reserve",
      bucket: "system",
      amount: 0, // 予約は残高を減らさない（reserved を増やす）
      balanceAfter: updated.balance,
      taskId: input.taskId,
      employeeId: input.employeeId,
      reservationId: reservation.id,
      idempotencyKey: input.idempotencyKey,
      note: `予約 ${input.amount} WT`,
      expiresAt: null,
    });

    return reservation;
  });
}

/**
 * 完了後の確定。実使用量で精算し、予約超過分は解放する。
 * 既に settled/released の予約に対しては何もしない。
 */
export async function settle(
  store: Store,
  orgId: string,
  reservationId: string,
  actualAmount: number,
): Promise<CreditReservation> {
  return store.withOrgLock(orgId, async () => {
    const reservation = await store.get("credit_reservations", orgId, reservationId);
    if (!reservation) throw new Error("reservation not found");
    if (reservation.status !== "reserved") return reservation;

    const wallet = await getWallet(store, orgId);
    // 実使用が予約を超えても、予約額を上限として課金する（想定外の過大課金を防ぐ）
    const charge = Math.max(0, Math.min(actualAmount, reservation.amount));

    const updatedWallet = await store.update("credit_wallets", orgId, wallet.id, {
      balance: wallet.balance - charge,
      reserved: Math.max(0, wallet.reserved - reservation.amount),
    });

    const updated = await store.update("credit_reservations", orgId, reservationId, {
      status: "settled",
      settledAmount: charge,
    });

    await appendLedger(store, {
      organizationId: orgId,
      type: "settle",
      bucket: "system",
      amount: -charge,
      balanceAfter: updatedWallet.balance,
      taskId: reservation.taskId,
      employeeId: reservation.employeeId,
      reservationId,
      idempotencyKey: `${reservation.idempotencyKey}:settle`,
      note: `確定 ${charge} WT（予約 ${reservation.amount} WT）`,
      expiresAt: null,
    });

    return updated;
  });
}

/** 失敗時の解放。未使用分を戻す。 */
export async function release(
  store: Store,
  orgId: string,
  reservationId: string,
  note = "実行失敗のため解放",
): Promise<CreditReservation> {
  return store.withOrgLock(orgId, async () => {
    const reservation = await store.get("credit_reservations", orgId, reservationId);
    if (!reservation) throw new Error("reservation not found");
    if (reservation.status !== "reserved") return reservation;

    const wallet = await getWallet(store, orgId);
    const updatedWallet = await store.update("credit_wallets", orgId, wallet.id, {
      reserved: Math.max(0, wallet.reserved - reservation.amount),
    });

    const updated = await store.update("credit_reservations", orgId, reservationId, {
      status: "released",
      settledAmount: 0,
    });

    await appendLedger(store, {
      organizationId: orgId,
      type: "release",
      bucket: "system",
      amount: 0,
      balanceAfter: updatedWallet.balance,
      taskId: reservation.taskId,
      employeeId: reservation.employeeId,
      reservationId,
      idempotencyKey: `${reservation.idempotencyKey}:release`,
      note,
      expiresAt: null,
    });

    return updated;
  });
}

export interface UsageSummary {
  balance: number;
  reserved: number;
  available: number;
  usedThisMonth: number;
  byEmployee: { employeeId: string | null; workTokens: number }[];
  byModel: { logicalModel: string; workTokens: number }[];
  byMonth: { month: string; workTokens: number }[];
}

export async function usageSummary(store: Store, orgId: string): Promise<UsageSummary> {
  const wallet = await getWallet(store, orgId);
  const usage = await store.list("model_usage", orgId);
  const monthKey = (iso: string) => iso.slice(0, 7);
  const thisMonth = monthKey(nowIso());

  const byEmployee = new Map<string | null, number>();
  const byModel = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let usedThisMonth = 0;

  for (const u of usage) {
    byEmployee.set(u.employeeId, (byEmployee.get(u.employeeId) ?? 0) + u.workTokens);
    byModel.set(u.logicalModel, (byModel.get(u.logicalModel) ?? 0) + u.workTokens);
    const m = monthKey(u.createdAt);
    byMonth.set(m, (byMonth.get(m) ?? 0) + u.workTokens);
    if (m === thisMonth) usedThisMonth += u.workTokens;
  }

  return {
    balance: wallet.balance,
    reserved: wallet.reserved,
    available: availableBalance(wallet),
    usedThisMonth,
    byEmployee: [...byEmployee].map(([employeeId, workTokens]) => ({ employeeId, workTokens })),
    byModel: [...byModel].map(([logicalModel, workTokens]) => ({ logicalModel, workTokens })),
    byMonth: [...byMonth].map(([month, workTokens]) => ({ month, workTokens })).sort((a, b) => a.month.localeCompare(b.month)),
  };
}
