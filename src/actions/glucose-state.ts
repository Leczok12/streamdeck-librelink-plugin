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
import { error } from 'console';

@action({ UUID: 'com.kamil-leczkowski.librelink-plugin.glucose-state' })
export class GlucoseState extends SingletonAction<Settings> {
    private interval: NodeJS.Timeout | undefined;
    private TIMEOUT = 10000;
    // private TIMEOUT = 500;
    private client: MiniLibrelinkClient | undefined = undefined;
    private settings: Settings = { email: '', password: '', error: '', unit: 'mgdl', type: '' };

    private setError(action: KeyAction, error: string) {
        this.settings.error = error;
        action.setSettings(this.settings);
    }

    private async loginAttempt(action: KeyAction) {
        if (this.settings.email === '' || this.settings.password === '') {
            this.setError(action, 'Set your credentials');
            return;
        }

        streamDeck.logger.info('client login attempt');
        this.setError(action, '');

        try {
            this.client = miniLibrelinkClient({ email: this.settings.email, password: this.settings.password });
            await this.client.login();
            streamDeck.logger.info('client logged in');
        } catch (error) {
            if (error instanceof Error) {
                this.setError(action, error.message);
                streamDeck.logger.error(error.message);
            } else {
                this.setError(action, 'Unknown error');
                streamDeck.logger.error('Unknown error');
            }
            this.client = undefined;
            action.setImage('');
        }
        action.setSettings(this.settings);
    }

    private async updateData(action: KeyAction) {
        if (!this.client) {
            action.setImage('');
            this.cencelInterval();
            return;
        }

        try {
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
                this.setError(action, error.message);
                streamDeck.logger.error(error.message);
            } else {
                this.setError(action, 'Unknown error');
                streamDeck.logger.error('Unknown error');
            }
            this.client = undefined;
            action.setImage('');
        }
    }

    private cencelInterval() {
        streamDeck.logger.info('Interval cenceled');
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
    }

    private startInterval(action: KeyAction) {
        if (!this.client) {
            this.loginAttempt(action);
            if (!this.client) return;
        }
        streamDeck.logger.info('Interval started');
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

    private updateSettings(settings: Settings) {
        streamDeck.logger.info('Settings update');
        streamDeck.logger.error({ recived_setting: settings });

        if (settings.email != undefined) {
            this.settings.email = settings.email;
        }
        if (settings.password != undefined) {
            this.settings.password = settings.password;
        }
        if (settings.unit != undefined) {
            this.settings.unit = settings.unit;
        }
        if (settings.error != undefined) {
            this.settings.error = settings.error;
        }
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
        this.updateSettings(ev.payload.settings);
        if (ev.payload.settings.type === 'login') {
            this.cencelInterval();
            this.loginAttempt(ev.action as KeyAction);
            this.startInterval(ev.action as KeyAction);
        }
    }

    override onWillAppear(ev: WillAppearEvent<Settings>): void | Promise<void> {
        this.startInterval(ev.action as KeyAction);
    }

    override onWillDisappear(ev: WillDisappearEvent<Settings>): void | Promise<void> {
        if (this.actions.next().done) {
            this.cencelInterval();
        }
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        this.cencelInterval();
        this.client = undefined;
        this.startInterval(ev.action as KeyAction);
    }
}
// export class GlucoseState extends SingletonAction<Settings> {
//     private interval: NodeJS.Timeout | undefined;
//     private TIMEOUT = 10000;
//     // private TIMEOUT = 500;
//     private client: MiniLibrelinkClient | undefined = undefined;
//     private settings: Settings = { email: '', password: '', error: '', unit: 'mgdl', type: '' };

//     private setError(action: KeyAction, error: string) {
//         this.settings.error = error;
//         action.setSettings(this.settings);
//     }

//     private async loginAttempt(action: KeyAction) {
//         if (this.settings.email === '' || this.settings.password === '') {
//             this.setError(action, 'Set your credentials');
//             return;
//         }

//         streamDeck.logger.info('client login attempt');
//         this.setError(action, '');

//         try {
//             this.client = miniLibrelinkClient({ email: this.settings.email, password: this.settings.password });
//             await this.client.login();
//             streamDeck.logger.info('client logged in');
//         } catch (error) {
//             if (error instanceof Error) {
//                 this.setError(action, error.message);
//                 streamDeck.logger.error(error.message);
//             } else {
//                 this.setError(action, 'Unknown error');
//                 streamDeck.logger.error('Unknown error');
//             }
//             this.client = undefined;
//             action.setImage('');
//         }
//         action.setSettings(this.settings);
//     }

//     private async updateData(action: KeyAction) {
//         if (!this.client) {
//             await this.loginAttempt(action);
//             action.setImage('');
//             this.cencelInterval();
//             return;
//         }
//         try {
//             streamDeck.logger.info('trying to receive data');
//             const data = await this.client.read();
//             streamDeck.logger.info('data received');

//             action.setTitle(this.settings.unit === 'mmol' ? data.valueMmol.toFixed(2) : data.valueMgdl.toString());
//             action.setImage(
//                 `imgs/actions/glucose-state/${data.state}-${(() => {
//                     switch (data.trend_name) {
//                         case 'Flat':
//                             return 'flat';
//                         case 'FortyFiveUp':
//                         case 'SingleUp':
//                             return 'rising';
//                         case 'FortyFiveDown':
//                         case 'SingleDown':
//                             return 'falling';
//                         default:
//                             return 'unknown';
//                     }
//                 })()}.svg`
//             );
//         } catch (error) {
//             if (error instanceof Error) {
//                 this.setError(action, error.message);
//                 streamDeck.logger.error(error.message);
//             } else {
//                 this.setError(action, 'Unknown error');
//                 streamDeck.logger.error('Unknown error');
//             }
//             this.client = undefined;
//             action.setImage('');
//         }
//     }

//     private cencelInterval() {
//         streamDeck.logger.info('Interval cenceled');
//         if (this.interval) {
//             clearInterval(this.interval);
//             this.interval = undefined;
//         }
//     }

//     private startInterval() {
//         streamDeck.logger.info('Interval started');
//         if (!this.interval) {
//             this.interval = setInterval(() => {
//                 for (const action of this.actions) {
//                     if (action.isKey()) {
//                         this.updateData(action);
//                     }
//                 }
//             }, this.TIMEOUT);
//         }
//     }

//     private updateSettings(settings: Settings) {
//         streamDeck.logger.info('Settings update');
//         if (settings.email != undefined) {
//             this.settings.email = settings.email;
//         }
//         if (settings.password != undefined) {
//             this.settings.password = settings.password;
//         }
//         if (settings.unit != undefined) {
//             this.settings.unit = settings.unit;
//         }
//         if (settings.error != undefined) {
//             this.settings.error = settings.error;
//         }
//     }

//     override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
//         streamDeck.logger.error({ recived_setting: ev.payload.settings });

//         this.updateSettings(ev.payload.settings);

//         if (ev.payload.settings.type === 'login') {
//             this.cencelInterval();
//             this.loginAttempt(ev.action as KeyAction);
//             this.startInterval();
//         }
//     }

//     override onWillAppear(ev: WillAppearEvent<Settings>): void | Promise<void> {
//         this.updateSettings(ev.payload.settings);
//         this.loginAttempt(ev.action as KeyAction);
//         if (!ev.action.isKey() || !this.settings) return;

//         this.startInterval();
//     }

//     override onWillDisappear(ev: WillDisappearEvent<Settings>): void | Promise<void> {
//         if (this.actions.next().done) {
//             this.cencelInterval();
//         }
//     }

//     override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
//         this.cencelInterval();
//         this.updateSettings(ev.payload.settings);
//         this.loginAttempt(ev.action as KeyAction);
//         if (!ev.action.isKey() || !this.settings) return;

//         this.startInterval();
//     }
// }
