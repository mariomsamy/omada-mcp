import type { CustomHeaders, OmadaApiResponse, PaginatedResult } from '../types/index.js';

import type { RequestHandler } from './request.js';
import type { SiteOperations } from './site.js';

export interface LogQueryOptions {
    page: number;
    pageSize: number;
    /** Unix milliseconds; provide both bounds when filtering audit logs. */
    startTime?: number;
    endTime?: number;
    searchKey?: string;
}

/** Log selection body for the official delete/resolve log operations (10-log.json). */
export interface LogSelectionBody {
    logs: string[];
    selectType: 'include' | 'exclude' | 'all';
    startTime: number;
    endTime: number;
    filterModule?: 'System' | 'Device';
}

/**
 * Log operations for the Omada API.
 * Covers site events, alerts, and audit logs.
 */
export class LogOperations {
    constructor(
        private readonly request: RequestHandler,
        private readonly site: SiteOperations,
        private readonly buildPath: (path: string, version?: string) => string
    ) {}

    /**
     * List site event logs.
     * OperationId: getEventLogsForSite
     */
    public async listSiteEvents(options: LogQueryOptions, siteId?: string, customHeaders?: CustomHeaders): Promise<PaginatedResult<unknown>> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/logs/events`);

        const params: Record<string, unknown> = {
            page: options.page,
            pageSize: options.pageSize,
        };

        if (options.startTime !== undefined) {
            params['filters.timeStart'] = options.startTime;
        }
        if (options.endTime !== undefined) {
            params['filters.timeEnd'] = options.endTime;
        }
        if (options.searchKey) {
            params.searchKey = options.searchKey;
        }

        const response = await this.request.get<OmadaApiResponse<PaginatedResult<unknown>>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * List site alert logs.
     * OperationId: getAlertLogsForSite
     */
    public async listSiteAlerts(options: LogQueryOptions, siteId?: string, customHeaders?: CustomHeaders): Promise<PaginatedResult<unknown>> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/logs/alerts`);

        const params: Record<string, unknown> = {
            page: options.page,
            pageSize: options.pageSize,
        };

        if (options.startTime !== undefined) {
            params['filters.timeStart'] = options.startTime;
        }
        if (options.endTime !== undefined) {
            params['filters.timeEnd'] = options.endTime;
        }
        if (options.searchKey) {
            params.searchKey = options.searchKey;
        }

        const response = await this.request.get<OmadaApiResponse<PaginatedResult<unknown>>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * List site audit logs.
     * OperationId: getAuditLogsForSite
     */
    public async listSiteAuditLogs(options: LogQueryOptions, siteId?: string, customHeaders?: CustomHeaders): Promise<PaginatedResult<unknown>> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/audit-logs`);

        const params: Record<string, unknown> = {
            page: options.page,
            pageSize: options.pageSize,
        };

        if ((options.startTime === undefined) !== (options.endTime === undefined)) {
            throw new Error('Audit log time filters require both startTime and endTime in Unix milliseconds.');
        }
        if (options.startTime !== undefined) {
            // Pass JSON to the HTTP client so it is URL-encoded exactly once.
            params['filters.times'] = JSON.stringify([{ timeStart: options.startTime, timeEnd: options.endTime }]);
        }
        if (options.searchKey) {
            params.searchKey = options.searchKey;
        }

        const response = await this.request.get<OmadaApiResponse<PaginatedResult<unknown>>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * List global event logs (all sites).
     * OperationId: getEventLogsForGlobal
     */
    public async listGlobalEvents(options: LogQueryOptions, customHeaders?: CustomHeaders): Promise<PaginatedResult<unknown>> {
        const path = this.buildPath('/logs/events');

        const params: Record<string, unknown> = {
            page: options.page,
            pageSize: options.pageSize,
        };

        if (options.startTime !== undefined) {
            params['filters.timeStart'] = options.startTime;
        }
        if (options.endTime !== undefined) {
            params['filters.timeEnd'] = options.endTime;
        }
        if (options.searchKey) {
            params.searchKey = options.searchKey;
        }

        const response = await this.request.get<OmadaApiResponse<PaginatedResult<unknown>>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * List global alert logs (all sites).
     * OperationId: getAlertLogsForGlobal
     */
    public async listGlobalAlerts(options: LogQueryOptions, customHeaders?: CustomHeaders): Promise<PaginatedResult<unknown>> {
        const path = this.buildPath('/logs/alerts');

        const params: Record<string, unknown> = {
            page: options.page,
            pageSize: options.pageSize,
        };

        if (options.startTime !== undefined) {
            params['filters.timeStart'] = options.startTime;
        }
        if (options.endTime !== undefined) {
            params['filters.timeEnd'] = options.endTime;
        }
        if (options.searchKey) {
            params.searchKey = options.searchKey;
        }

        const response = await this.request.get<OmadaApiResponse<PaginatedResult<unknown>>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * List global audit logs (all sites).
     * OperationId: getAuditLogsForGlobal
     */
    public async listGlobalAuditLogs(options: LogQueryOptions, customHeaders?: CustomHeaders): Promise<PaginatedResult<unknown>> {
        const path = this.buildPath('/audit-logs');

        const params: Record<string, unknown> = {
            page: options.page,
            pageSize: options.pageSize,
        };

        if ((options.startTime === undefined) !== (options.endTime === undefined)) {
            throw new Error('Audit log time filters require both startTime and endTime in Unix milliseconds.');
        }
        if (options.startTime !== undefined) {
            // Pass JSON to the HTTP client so it is URL-encoded exactly once.
            params['filters.times'] = JSON.stringify([{ timeStart: options.startTime, timeEnd: options.endTime }]);
        }
        if (options.searchKey) {
            params.searchKey = options.searchKey;
        }

        const response = await this.request.get<OmadaApiResponse<PaginatedResult<unknown>>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    // Logs, Events & Alerts tools (issue #42)

    /**
     * Get site log notification settings (v1).
     * OperationId: getLogSettingForSite
     */
    public async getLogSettingForSite(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/site/log-notification`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get site log notification settings (v2).
     * OperationId: getLogSettingForSiteV2
     */
    public async getLogSettingForSiteV2(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/site/log-notification`, 'v2');
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get site audit notification settings.
     * OperationId: getAuditLogSettingForSite
     */
    public async getAuditLogSettingForSite(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/site/audit-notification`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get global log notification settings (v1).
     * OperationId: getLogSettingForGlobal
     */
    public async getLogSettingForGlobal(customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath('/log-notification');
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get global log notification settings (v2).
     * OperationId: getLogSettingForGlobalV2
     */
    public async getLogSettingForGlobalV2(customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath('/log-notification', 'v2');
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get global audit notification settings.
     * OperationId: getAuditLogSettingForGlobal
     */
    public async getAuditLogSettingForGlobal(customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath('/audit-notification');
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get global audit logs (paginated, optional filters).
     * OperationId: getAuditLogsForGlobal
     */
    public async getAuditLogsForGlobal(
        page: number,
        pageSize: number,
        options?: {
            sortTime?: string;
            filterResult?: number;
            filterLevel?: string;
            filterAuditTypes?: string;
            filterTimes?: string;
            searchKey?: string;
        },
        customHeaders?: CustomHeaders
    ): Promise<unknown> {
        const path = this.buildPath('/audit-logs');
        const params: Record<string, unknown> = { page, pageSize };
        if (options?.sortTime !== undefined) params['sorts.time'] = options.sortTime;
        if (options?.filterResult !== undefined) params['filters.result'] = options.filterResult;
        if (options?.filterLevel !== undefined) params['filters.level'] = options.filterLevel;
        if (options?.filterAuditTypes !== undefined) params['filters.auditTypes'] = options.filterAuditTypes;
        if (options?.filterTimes !== undefined) params['filters.times'] = options.filterTimes;
        if (options?.searchKey !== undefined) params.searchKey = options.searchKey;
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, params, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Delete site alert or event logs (ported operation; route verified in docs/openapi).
     * OperationId: deleteAlertLogsForSite, deleteEventLogsForSite
     */
    public async deleteSiteLogs(
        kind: 'alerts' | 'events',
        selection: LogSelectionBody,
        siteId?: string,
        customHeaders?: CustomHeaders
    ): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/logs/${kind}/delete`);
        const response = await this.request.request<OmadaApiResponse<unknown>>({ method: 'DELETE', url: path, data: selection }, true, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Delete global alert or event logs (ported operation; route verified in docs/openapi).
     * OperationId: deleteAlertLogsForGlobal, deleteEventLogsForGlobal
     */
    public async deleteGlobalLogs(kind: 'alerts' | 'events', selection: LogSelectionBody, customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath(`/logs/${kind}/delete`);
        const response = await this.request.request<OmadaApiResponse<unknown>>({ method: 'DELETE', url: path, data: selection }, true, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Resolve site alert logs (ported operation; route verified in docs/openapi).
     * OperationId: resolveAlertForSite
     */
    public async resolveSiteAlerts(selection: LogSelectionBody, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/logs/alerts/resolve`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, selection, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Reset site log notification settings (ported operation; route verified in docs/openapi).
     * OperationId: resetLogSettingSite
     */
    public async resetLogSettingForSite(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/site/reset/log-notification`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, {}, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Reset global log notification settings (ported operation; route verified in docs/openapi).
     * OperationId: resetLogSettingGlobal
     */
    public async resetLogSettingForGlobal(customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath('/reset/log-notification');
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, {}, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Modify site log notification settings (v2) (ported operation; route verified in docs/openapi).
     * OperationId: modifyLogSettingSiteV2
     */
    public async modifyLogSettingForSiteV2(payload: Record<string, unknown>, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/site/log-notification`, 'v2');
        const response = await this.request.patch<OmadaApiResponse<unknown>>(path, payload, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Modify global log notification settings (v2) (ported operation; route verified in docs/openapi).
     * OperationId: modifyLogSettingGlobalV2
     */
    public async modifyLogSettingForGlobalV2(payload: Record<string, unknown>, customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath('/log-notification', 'v2');
        const response = await this.request.patch<OmadaApiResponse<unknown>>(path, payload, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Modify site audit log notification settings (ported operation; route verified in docs/openapi).
     * OperationId: modifyAuditLogSettingSite_1
     */
    public async modifyAuditLogSettingForSite(payload: Record<string, unknown>, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/site/audit-notification`);
        const response = await this.request.patch<OmadaApiResponse<unknown>>(path, payload, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Modify global audit log notification settings (ported operation; route verified in docs/openapi).
     * OperationId: modifyAuditLogSettingGlobal
     */
    public async modifyAuditLogSettingForGlobal(payload: Record<string, unknown>, customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath('/audit-notification');
        const response = await this.request.patch<OmadaApiResponse<unknown>>(path, payload, customHeaders);
        return this.request.ensureSuccess(response);
    }
}
