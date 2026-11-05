import type { CustomHeaders, OmadaApiResponse } from '../types/index.js';

import type { RequestHandler } from './request.js';
import type { SiteOperations } from './site.js';

/**
 * Low-risk operational actions backed by the official Omada Open API.
 * These are intentionally limited to device/client actions with clear operator intent.
 */
/** Device families that expose ledSetting in a documented general-config route. */
export type DeviceLedType = 'ap' | 'switch' | 'gateway';

export class ActionOperations {
    constructor(
        private readonly request: RequestHandler,
        private readonly site: SiteOperations,
        private readonly buildPath: (path: string, version?: string) => string
    ) {}

    public async rebootDevice(deviceMac: string, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/devices/${encodeURIComponent(deviceMac)}/reboot`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, {}, customHeaders);
        return this.request.ensureSuccess(response);
    }

    public async blockClient(clientMac: string, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/clients/${encodeURIComponent(clientMac)}/block`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, {}, customHeaders);
        return this.request.ensureSuccess(response);
    }

    public async unblockClient(clientMac: string, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/clients/${encodeURIComponent(clientMac)}/unblock`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, {}, customHeaders);
        return this.request.ensureSuccess(response);
    }

    public async reconnectClient(clientMac: string, siteId?: string, customHeaders?: CustomHeaders): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/clients/${encodeURIComponent(clientMac)}/reconnect`);
        const response = await this.request.post<OmadaApiResponse<unknown>>(path, {}, customHeaders);
        return this.request.ensureSuccess(response);
    }

    /**
     * Set one device's LED through its documented general-config route (03-device.json):
     * PATCH aps/{apMac}/general-config (modifyGeneralConfig_2), switches/{switchMac}/general-config
     * (modifyGeneralConfig) or gateways/{gatewayMac}/general-config (modifyGeneralConfig_1).
     * There is no device-type-agnostic LED route in the Open API.
     */
    public async setDeviceLed(
        deviceMac: string,
        ledSetting: number,
        deviceType: DeviceLedType,
        siteId?: string,
        customHeaders?: CustomHeaders
    ): Promise<unknown> {
        const resolvedSiteId = await this.site.resolveSiteId(siteId);
        const collection = { ap: 'aps', switch: 'switches', gateway: 'gateways' }[deviceType];
        const path = this.buildPath(`/sites/${encodeURIComponent(resolvedSiteId)}/${collection}/${encodeURIComponent(deviceMac)}/general-config`);
        const response = await this.request.patch<OmadaApiResponse<unknown>>(path, { ledSetting }, customHeaders);
        return this.request.ensureSuccess(response);
    }
}
