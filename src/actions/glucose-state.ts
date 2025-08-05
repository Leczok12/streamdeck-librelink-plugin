import streamDeck, {
    action,
    ActionContext,
    DidReceiveSettingsEvent,
    KeyAction,
    KeyDownEvent,
    Logger,
    SingletonAction,
    Target,
    WillAppearEvent,
    WillDisappearEvent
} from '@elgato/streamdeck';

import { LibreLinkUpClient } from '@diakem/libre-link-up-api-client';
import { LibreCgmData } from '@diakem/libre-link-up-api-client/lib/types/client';

type Settings = {
    email: string;
    password: string;
    event: 'save' | undefined;
    error: string | undefined;
};

type ExtendedLibreCgmData = LibreCgmData & { isActive: boolean };

type AcctionInterface = WillAppearEvent<Settings> | KeyDownEvent<Settings> | DidReceiveSettingsEvent<Settings>;

@action({ UUID: 'com.kamil-leczkowski.librelink-plugin.glucose-state' })
export class GlucoseState extends SingletonAction<Settings> {
    private interval: ReturnType<typeof setInterval> | undefined = undefined;
    private libreLinkUpClient: ReturnType<typeof LibreLinkUpClient> | undefined = undefined;

    private createLibreLinkUpClient = async (ev: AcctionInterface) => {
        if (this.libreLinkUpClient === undefined) {
            streamDeck.logger.info('login attempt');

            this.libreLinkUpClient = LibreLinkUpClient({ username: ev.payload.settings.email, password: ev.payload.settings.password });

            try {
                await this.libreLinkUpClient.login();
                streamDeck.logger.info('login successful');
            } catch (error) {
                this.libreLinkUpClient = undefined;
                const settings = await ev.action.getSettings();
                settings.error = 'Bad credentials or too many login requests';
                streamDeck.logger.error(error);
            }
        } else {
            streamDeck.logger.info('user already logged');
        }
    };

    private readLibreLinkUpClientData = async (): Promise<ExtendedLibreCgmData | undefined> => {
        if (this.libreLinkUpClient === undefined) return undefined;
        const rawData = await this.libreLinkUpClient.readRaw();
        const cgmData = (await this.libreLinkUpClient.read()).current;

        const extendedCgmData: ExtendedLibreCgmData = {
            ...cgmData,
            isHigh: cgmData.value >= rawData.connection.targetHigh,
            isLow: cgmData.value >= rawData.connection.targetLow,
            isActive:
                Math.floor(Date.now() / 1000) - rawData.connection.sensor.a > 3600 &&
                Math.floor(Date.now() / 1000) - rawData.connection.sensor.a < 1209600
        };

        streamDeck.logger.info('cgm data -> ' + JSON.stringify(rawData));
        return extendedCgmData;
    };

    private renderLibreLinkUpClientData = async () => {
        for (const action of this.actions) {
            const data = await this.readLibreLinkUpClientData();

            if (data === undefined) {
                action.setImage('');
                action.setTitle('');
                return;
            }

            if (data === undefined) {
                action.setImage('');
                action.setTitle('');
                return;
            }

            const color = (() => {
                if (!data.isActive) return '#666666';
                else if (data.isHigh) return '#fc9c02';
                else if (data.isLow) return '#ff0000';
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
                ${
                    data.isActive
                        ? `<path fill-rule="evenodd" fill="#ffffff" transform="rotate(${angle} 69 118.3)" stroke="#ffffff" stroke-width="5" d="m54 120.3q0-0.2 0.1-0.5 0.1-0.2 0.3-0.4 0.1-0.2 0.4-0.3 0.2 0 0.5 0h29.6l-7.9-8c-0.2-0.2-0.4-0.5-0.4-0.8 0-0.4 0.2-0.7 0.4-0.9 0.2-0.3 0.5-0.4 0.9-0.4 0.3 0 0.6 0.1 0.9 0.4l10 10q0.2 0.2 0.3 0.4 0.1 0.3 0.1 0.5 0 0.3-0.1 0.5-0.1 0.2-0.3 0.4l-10.1 10.1c-0.2 0.2-0.5 0.3-0.8 0.3-0.4 0-0.7-0.1-0.9-0.3-0.3-0.3-0.4-0.6-0.4-0.9 0-0.4 0.1-0.7 0.4-0.9l7.9-7.9h-29.6q-0.3 0-0.5-0.1-0.3-0.1-0.4-0.3-0.2-0.2-0.3-0.4-0.1-0.2-0.1-0.5z"/>`
                        : ''
                }
            </svg>`;

            const base64svg = btoa(unescape(encodeURIComponent(svg)));

            action.setImage(`data:image/svg+xml;base64,${base64svg}`);
            action.setTitle(data.isActive ? data.value.toString() : '---');
        }
    };

    private createInterval = () => {
        this.renderLibreLinkUpClientData();
        this.interval = setInterval(this.renderLibreLinkUpClientData, 60000);
        streamDeck.logger.info('Interval created');
    };

    private destroyInterval = () => {
        if (this.interval === undefined) return;

        clearInterval(this.interval);
        this.interval = undefined;
        streamDeck.logger.info('Interval destroyed');
    };

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
        const settings = ev.payload.settings;
        streamDeck.logger.info('settings -> ' + JSON.stringify(ev.payload.settings));
        if (ev.payload.settings.event === 'save') {
            settings.error = undefined;
            settings.event = undefined;
            settings.email = ev.payload.settings.email;
            settings.password = ev.payload.settings.password;

            ev.action.setSettings(settings);

            this.libreLinkUpClient = undefined;
            await this.createLibreLinkUpClient(ev);
            await this.renderLibreLinkUpClientData();
        }
    }

    override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
        await this.createLibreLinkUpClient(ev);
        this.createInterval();
    }

    override async onWillDisappear(ev: WillDisappearEvent<Settings>): Promise<void> {
        this.destroyInterval();
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        await this.createLibreLinkUpClient(ev);
        await this.renderLibreLinkUpClientData();
    }
}
