import streamDeck, { action, DidReceiveSettingsEvent, KeyAction, KeyDownEvent, KeyUpEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';

import { LibreLinkUpClient } from '@diakem/libre-link-up-api-client';
import { LibreCgmData } from '@diakem/libre-link-up-api-client/lib/types/client';

type Settings = {
    email: string;
    password: string;
    event: 'login' | undefined;
    error: string | undefined;
    interval: number | undefined;
};

type ExtendedLibreCgmData = LibreCgmData & {
    activationState: 'activation' | 'active' | 'expired';
    activationCountdown: number;
    isTargetHigh: boolean;
    isTargetLow: boolean;
};

type ActionInterface = WillAppearEvent<Settings> | KeyDownEvent<Settings> | DidReceiveSettingsEvent<Settings> | WillDisappearEvent<Settings>;

/*TODO: change everything to event storage and maps, create one shared interval launched per action */

@action({ UUID: 'com.kamil-leczkowski.librelink-plugin.glucose-state' })
export class GlucoseState extends SingletonAction<Settings> {
    private interval: ReturnType<typeof setInterval> | undefined = undefined;
    private libreLinkUpClient: Map<string, ReturnType<typeof LibreLinkUpClient> | undefined> = new Map();

    constructor() {
        super();
        this.interval = setInterval(() => {
            for (const action of this.actions) {
                this.resetError(action.id);
                this.renderLibreLinkUpClientData(action.id);
            }
        }, 60000);
    }

    private createLibreLinkUpClient = async (id: string) => {
        const action = this.actions.find((a) => a.id === id);

        if (!action) return;

        const settings = await action.getSettings();

        if (!settings.email || !settings.password) {
            this.libreLinkUpClient.delete(action.id);
            this.setError(action.id, `Email or password not set`);
            return;
        }

        streamDeck.logger.info(`[ ${id} ] - settings -> ` + JSON.stringify(settings));

        if (this.libreLinkUpClient.get(action.id) === undefined) {
            streamDeck.logger.info(`[ ${id} ] - login attempt`);
            const libreLinkUpClient = LibreLinkUpClient({
                username: settings.email,
                password: settings.password,
                clientVersion: '4.16.0'
            });

            try {
                await libreLinkUpClient.login();
                streamDeck.logger.info(`[ ${id} ] - login successful`);
                this.libreLinkUpClient.set(action.id, libreLinkUpClient);
                this.resetError(action.id);
            } catch (error: Error | any) {
                this.libreLinkUpClient.delete(action.id);
                this.setError(action.id, error.message);
            }
        } else {
            streamDeck.logger.info(`[ ${id} ] - user already logged`);
        }
    };

    private readLibreLinkUpClientData = async (id: string): Promise<ExtendedLibreCgmData | undefined> => {
        const libreLinkUpClient = this.libreLinkUpClient.get(id);

        if (!libreLinkUpClient) return undefined;

        const rawData = await libreLinkUpClient.readRaw();
        const cgmData = (await libreLinkUpClient.read())?.current;

        if (!cgmData || !rawData) return undefined;

        const extendedCgmData: ExtendedLibreCgmData = {
            ...cgmData,
            isTargetHigh: cgmData.value >= rawData.connection.targetHigh,
            isTargetLow: cgmData.value <= rawData.connection.targetLow,
            activationCountdown: Math.ceil(3600 - (Math.floor(Date.now() / 1000) - rawData.connection.sensor.a)) / 60,
            activationState: (() => {
                if (Math.floor(Date.now() / 1000) - rawData.connection.sensor.a <= 3600) return 'activation';
                else if (Math.floor(Date.now() / 1000) - rawData.connection.sensor.a > 1209600) return 'expired';
                else return 'active';
            })()
        };

        streamDeck.logger.info(`[ ${id} ] - cgm data -> ` + JSON.stringify(extendedCgmData));
        return extendedCgmData;
    };

    private renderLibreLinkUpClientData = async (id: string) => {
        const action = this.actions.find((a) => a.id === id);

        if (!action) return;

        const data = await this.readLibreLinkUpClientData(id);

        if (data === undefined) {
            action.setImage('');
            action.setTitle('');
            return;
        }

        if (data.activationState === 'activation') {
            const svg = `
                <svg version="1.2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
                    <path fill-rule="evenodd" fill="#FFD100" d="m144 0v144h-144v-144z"/>
                </svg>
            `;
            const base64svg = btoa(unescape(encodeURIComponent(svg)));
            action.setImage(`data:image/svg+xml;base64,${base64svg}`);
            action.setTitle(`${data.activationCountdown.toFixed(0)}\nmin`);
            return;
        }

        if (data.activationState === 'expired') {
            const svg = `
                <svg version="1.2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
                    <path fill-rule="evenodd" fill="#666666" d="m144 97v47h-144v-47z"/>
                </svg>  
            `;
            const base64svg = btoa(unescape(encodeURIComponent(svg)));
            action.setImage(`data:image/svg+xml;base64,${base64svg}`);
            action.setTitle('---');
            return;
        }

        const color = (() => {
            if (data.isTargetHigh) return '#fc9c02';
            else if (data.isTargetLow) return '#ff0000';
            else return '#00ff00';
        })();

        const angle = (() => {
            switch (data.trend) {
                case 'Flat':
                    return 0;
                case 'FortyFiveDown':
                    return 45;
                case 'FortyFiveUp':
                    return -45;
                case 'SingleUp':
                    return -90;
                case 'SingleDown':
                    return 90;
                default:
                    return 0;
            }
        })();

        const svg = `
        <svg version="1.2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">
            <path fill-rule="evenodd" fill="${color}" d="m144 97v47h-144v-47z"/>
            <path fill-rule="evenodd" fill="#ffffff" transform="rotate(${angle} 69 118.3)" stroke="#ffffff" stroke-width="5" d="m54 120.3q0-0.2 0.1-0.5 0.1-0.2 0.3-0.4 0.1-0.2 0.4-0.3 0.2 0 0.5 0h29.6l-7.9-8c-0.2-0.2-0.4-0.5-0.4-0.8 0-0.4 0.2-0.7 0.4-0.9 0.2-0.3 0.5-0.4 0.9-0.4 0.3 0 0.6 0.1 0.9 0.4l10 10q0.2 0.2 0.3 0.4 0.1 0.3 0.1 0.5 0 0.3-0.1 0.5-0.1 0.2-0.3 0.4l-10.1 10.1c-0.2 0.2-0.5 0.3-0.8 0.3-0.4 0-0.7-0.1-0.9-0.3-0.3-0.3-0.4-0.6-0.4-0.9 0-0.4 0.1-0.7 0.4-0.9l7.9-7.9h-29.6q-0.3 0-0.5-0.1-0.3-0.1-0.4-0.3-0.2-0.2-0.3-0.4-0.1-0.2-0.1-0.5z"/>
        </svg>`;

        const base64svg = btoa(unescape(encodeURIComponent(svg)));

        action.setImage(`data:image/svg+xml;base64,${base64svg}`);
        if (data.isHigh) {
            action.setTitle('High');
        } else if (data.isLow) {
            action.setTitle('Low');
        } else {
            action.setTitle(data.value.toString());
        }
    };

    private resetError = async (id: string, settings?: Settings | undefined) => {
        const action = this.actions.find((a) => a.id === id);

        if (!action) return;

        if (settings) {
            action.setSettings({
                ...settings,
                error: undefined,
                event: undefined
            });
        } else {
            await action.setSettings({
                ...(await action.getSettings()),
                error: undefined,
                event: undefined
            });
        }
    };

    private setError = async (id: string, error: string) => {
        const action = this.actions.find((a) => a.id === id);

        if (!action) return;

        action.setImage('');
        action.setTitle('');
        action.showAlert();

        streamDeck.logger.error(`[ ${id} ] - error -> ${error}`);
        await action.setSettings({
            ...(await action.getSettings()),
            error: error
        });
    };

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
        if (ev.payload.settings.event === 'login') {
            await this.resetError(ev.action.id, ev.payload.settings);
            this.libreLinkUpClient.set(ev.action.id, undefined);
            await this.createLibreLinkUpClient(ev.action.id);
            await this.renderLibreLinkUpClientData(ev.action.id);
        }
    }

    override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
        await this.createLibreLinkUpClient(ev.action.id);
        await this.renderLibreLinkUpClientData(ev.action.id);
    }

    override async onWillDisappear(ev: WillDisappearEvent<Settings>): Promise<void> {
        //this.destroyInterval(ev);
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        //this.renderLibreLinkUpClientData();
        //await this.createLibreLinkUpClient(ev);
        //await this.renderLibreLinkUpClientData(ev);
    }
}
