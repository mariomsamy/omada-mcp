import type { CustomHeaders, OmadaApiResponse } from '../types/index.js';

import type { RequestHandler } from './request.js';
import type { SiteOperations } from './site.js';

/**
 * Schedule operations for the Omada API.
 * Covers upgrade, reboot, PoE, and port schedules.
 */
export class ScheduleOperations {
    constructor(
        private readonly request: RequestHandler,
        private readonly site: SiteOperations,
        private readonly buildPath: (path: string) => string
    ) {}

    /**
     * Get upgrade schedule list for a site.
     * OperationId: getUpgradeScheduleList
     */
    public async getUpgradeScheduleList(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/upgrade-schedules`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get reboot schedule list for a site template.
     * OperationId: getRebootScheduleList_1
     */
    public async getRebootScheduleList(siteTemplateId: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const path = this.buildPath(`/sitetemplates/${encodeURIComponent(siteTemplateId)}/reboot-schedules`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get PoE schedule list for a site.
     * OperationId: getPoeScheduleList
     */
    public async getPoeScheduleList(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/poe-schedules`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get port schedule list for a site.
     * OperationId: getPortScheduleList
     */
    public async getPortScheduleList(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/port-schedules`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Get port schedule ports for a site.
     * OperationId: getPortSchedulePorts
     */
    public async getPortSchedulePorts(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/port-status-ports`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * List site reboot schedules (ported operation; route verified in docs/openapi).
     * OperationId: getRebootScheduleList
     */
    public async listSiteRebootSchedules(siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/reboot-schedules`);
        const response = await this.request.get<OmadaApiResponse<unknown>>(path, undefined, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Create a site reboot schedule (ported operation; route verified in docs/openapi).
     * OperationId: createRebootSchedule
     */
    public async createRebootSchedule(schedule: object, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/reboot-schedules`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, schedule, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Replace a site reboot schedule (ported operation; route verified in docs/openapi).
     * OperationId: modifyRebootSchedule
     */
    public async modifyRebootSchedule(scheduleId: string, schedule: object, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/reboot-schedules/${encodeURIComponent(scheduleId)}`);
        const response = await this.request.put<OmadaApiResponse<unknown>>(path, schedule, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Delete a site reboot schedule (ported operation; route verified in docs/openapi).
     * OperationId: deleteRebootSchedule
     */
    public async deleteRebootSchedule(scheduleId: string, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/reboot-schedules/${encodeURIComponent(scheduleId)}`);
        const response = await this.request.delete<OmadaApiResponse<unknown>>(path, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Create a site PoE schedule (ported operation; route verified in docs/openapi).
     * OperationId: createPoeSchedule
     */
    public async createPoeSchedule(schedule: object, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/poe-schedules`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, schedule, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Replace a site PoE schedule (ported operation; route verified in docs/openapi).
     * OperationId: modifyPoeSchedule
     */
    public async modifyPoeSchedule(poeScheduleId: string, schedule: object, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/poe-schedules/${encodeURIComponent(poeScheduleId)}`);
        const response = await this.request.put<OmadaApiResponse<unknown>>(path, schedule, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Delete a site PoE schedule (ported operation; route verified in docs/openapi).
     * OperationId: deletePoeSchedule
     */
    public async deletePoeSchedule(poeScheduleId: string, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/poe-schedules/${encodeURIComponent(poeScheduleId)}`);
        const response = await this.request.delete<OmadaApiResponse<unknown>>(path, customHeaders);
        return this.request.ensureSuccess(response);
    }
}
