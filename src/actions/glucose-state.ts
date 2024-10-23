import streamDeck, {
    action,
    DidReceiveSettingsEvent,
    KeyAction,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent
} from '@elgato/streamdeck';

import { Settings } from '../types';
import { MiniLibrelinkClient, miniLibrelinkClient } from '../mini-librelink-client';

@action({ UUID: 'com.kamil-leczkowski.librelink-plugin.glucose-state' })
export class GlucoseState extends SingletonAction<Settings> {
    private interval: NodeJS.Timeout | undefined;
    private TIMEOUT = 60000;
    // private TIMEOUT = 500;
    private client: MiniLibrelinkClient | undefined = undefined;
    private settings: Settings = { email: '', password: '', unit: 'mgdl' };

    private async updateData(action: KeyAction) {
        if (!this.client && (this.settings.email == '' || this.settings.password == '')) {
            action.setTitle('Log\nin');
            action.setImage('');
            this.cencelInterval();
            return;
        }
        try {
            if (!this.client) {
                streamDeck.logger.info('client login attempt');
                this.client = miniLibrelinkClient({ email: this.settings.email, password: this.settings.password });
                await this.client.login();
                streamDeck.logger.info('client logged in');
            }
            streamDeck.logger.info('trying to receive data');
            const data = await this.client.read();
            streamDeck.logger.info('data received');

            action.setTitle(this.settings.unit === 'mmol' ? data.valueMmol.toFixed(2) : data.valueMgdl.toString());
            action.setImage(
                `imgs/actions/glucose-state/${data.state}-${(() => {
                    switch (data.trend_name) {
                        case 'Flat':
                            return 'flat';
                        case 'FortyFiveUp':
                        case 'SingleUp':
                            return 'rising';
                        case 'FortyFiveDown':
                        case 'SingleDown':
                            return 'falling';
                        default:
                            return 'unknown';
                    }
                })()}.svg`
            );
        } catch (error) {
            if (error instanceof Error) {
                streamDeck.logger.error(error.message);
                action.setTitle(error.message);
            } else {
                streamDeck.logger.error('Unknown error');
                action.setTitle('Unknown\nerror');
            }
            this.client = undefined;
            action.setImage('');
        }
    }

    private cencelInterval() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
        if (this.settings) this.settings.unit = ev.payload.settings.unit;
        else this.settings = ev.payload.settings;
        this.updateData(ev.action as KeyAction);
    }

    override onWillAppear(ev: WillAppearEvent<Settings>): void | Promise<void> {
        this.settings = ev.payload.settings;
        if (!ev.action.isKey() || !this.settings) return;
        this.updateData(ev.action);

        if (!this.interval) {
            this.interval = setInterval(() => {
                for (const action of this.actions) {
                    if (action.isKey()) {
                        this.updateData(action);
                    }
                }
            }, this.TIMEOUT);
        }
    }

    override onWillDisappear(ev: WillDisappearEvent<Settings>): void | Promise<void> {
        if (this.actions.next().done) {
            this.cencelInterval();
        }
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        this.cencelInterval();
        this.settings = ev.payload.settings;
        this.client = undefined;
        this.updateData(ev.action);
        if (!this.interval) {
            this.interval = setInterval(() => {
                for (const action of this.actions) {
                    if (action.isKey()) {
                        this.updateData(action);
                    }
                }
            }, this.TIMEOUT);
        }
    }
}
