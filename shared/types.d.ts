export type Platform = 'SPLIIIT' | 'SHARHUB';
export type Role = 'ADMIN' | 'OPERATOR';
export type NotificationType = 'RECHARGE_DUE' | 'RECHARGE_URGENT' | 'TENANT_ARRIVAL' | 'TENANT_DEPARTURE' | 'GENERAL';
export type ActionType = 'RECHARGE' | 'ADD_TENANT' | 'REMOVE_TENANT';
export type RenewalFrequency = 'MONTHLY' | 'YEARLY';
export type TenantStatus = 'ACTIVE' | 'LEFT';
export interface ApiSuccess<T> {
    data: T;
}
export interface ApiListSuccess<T> {
    data: T[];
    count: number;
}
export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: Record<string, string>;
    };
}
export interface RegisterRequest {
    email: string;
    password: string;
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface AuthResponse {
    accessToken: string;
    operator: OperatorProfile;
}
export interface OperatorProfile {
    id: number;
    email: string;
    role: Role;
    createdAt: string;
}
export interface AppleAccountDto {
    id: number;
    email: string;
    displayName: string;
    deducedBalanceKurus: number;
    createdAt: string;
}
export interface CreateAppleAccountRequest {
    email: string;
    password: string;
    displayName: string;
}
export interface SubscriptionDto {
    id: number;
    name: string;
    priceTRYKurus: number;
    priceEURCents: number;
    renewalDay: number;
    renewalFrequency: RenewalFrequency;
    appleAccountId: number;
    sharingPlatformAccountId: number | null;
    createdAt: string;
}
export interface CreateSubscriptionRequest {
    name: string;
    priceTRYKurus: number;
    priceEURCents: number;
    renewalDay: number;
    renewalFrequency: RenewalFrequency;
    appleAccountId: number;
    sharingPlatformAccountId?: number;
}
export interface SharingPlatformAccountDto {
    id: number;
    platform: Platform;
    email: string;
    displayName: string;
    createdAt: string;
}
export interface CockpitAction {
    id: number;
    type: ActionType;
    title: string;
    description: string;
    isUrgent: boolean;
    dueDate: string;
    relatedSubscriptionId: number;
    relatedAppleAccountId?: number;
}
export interface CreateRechargeRequest {
    appleAccountId: number;
    amountTRYKurus: number;
}
export interface MonthlyFinanceSummary {
    month: string;
    totalTRYSpentKurus: number;
    totalEURReceivedCents: number;
    netProfitCents: number;
    subscriptionBreakdown: SubscriptionProfit[];
}
export interface SubscriptionProfit {
    subscriptionId: number;
    subscriptionName: string;
    costTRYKurus: number;
    revenueEURCents: number;
    profitCents: number;
}
