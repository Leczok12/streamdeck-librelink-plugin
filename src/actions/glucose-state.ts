import streamDeck, { action, DidReceiveSettingsEvent, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';

import { GlucoseData, Settings } from '../types';

import { LibreLinkClient } from 'libre-link-unofficial-api';
import { error } from 'console';
import axios from 'axios';

@action({ UUID: 'com.kamil-leczkowski.librelink-plugin.glucose-state' })
export class GlucoseState extends SingletonAction<Settings> {
    private timeout: NodeJS.Timeout | undefined;
    private client: undefined | LibreLinkClient = undefined;
    private settings: Settings | undefined;

    private async getData(): Promise<GlucoseData | undefined> {
        if (!this.settings) throw new Error('Settings is missing');
        // ===[LOGIN]===
        if (!this.client) {
            streamDeck.logger.info('Logging the client');
            try {
                this.client = new LibreLinkClient({
                    email: this.settings.email,
                    password: this.settings.password
                });
                await this.client.login();
                streamDeck.logger.info('Client logged');
            } catch (error) {
                this.client = undefined;
                if (error instanceof Error) {
                    streamDeck.logger.error(`${error.message}`);
                    throw new Error(
                        (() => {
                            if (error.message.includes('Status: 430')) {
                                return 'Too many requests';
                            } else if (error.message.includes('Invalid credentials.')) {
                                return 'Invalid credentials';
                            }
                            return 'Unknown error';
                        })()
                    );
                }
                streamDeck.logger.error('Unknown error');
                throw new Error('Unknown error');
            }
        }
        // ===[/LOGIN]===
        try {
            const res = await this.client.read();
            streamDeck.logger.info('Getting data');
            return {
                value: this.settings.unit === 'mgdl' ? res.mgDl.toString() : res.mmol,
                type: res.isLow ? 'low' : res.isHigh ? 'high' : 'ok',
                trend: (() => {
                    switch (res.trend) {
                        case 3:
                            return 'flat';
                        case 2:
                        case 1:
                            return 'falling';
                        case 4:
                        case 5:
                            return 'rising';
                        default:
                            return 'unknow';
                    }
                })()
            };
        } catch (error) {
            if (error instanceof Error) {
                streamDeck.logger.error(`${error.message}`);
                throw new Error('Unknown error');
            }
        }
    }

    private async setDisplay(): Promise<{ img: string; text: string }> {
        try {
            const res = await this.getData();
            if (res) return { img: `imgs/actions/glucose-state/${res.type}-${res.trend}.svg`, text: res.value };
        } catch (error) {
            throw error;
            // if (error instanceof Error) throw error;
            // return { img: '', text: error.message.replace(/\s+/g, '\n') };
        }
        return { img: '', text: `Unknown\nerror` };
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): void {
        this.settings = ev.payload.settings;
        this.setDisplay()
            .then((e) => {
                ev.action.setImage(e.img);
                ev.action.setTitle(e.text);
            })
            .catch((e) => {
                ev.action.setImage('');
                if (e instanceof Error) ev.action.setTitle(e.message.replace(/\s+/g, '\n'));
                else ev.action.setTitle('Unknown error');
            });
    }

    override onWillAppear(ev: WillAppearEvent<Settings>): void | Promise<void> {
        this.settings = ev.payload.settings;
        this.setDisplay()
            .then((e) => {
                ev.action.setImage(e.img);
                ev.action.setTitle(e.text);
            })
            .catch((e) => {
                ev.action.setImage('');
                if (e instanceof Error) ev.action.setTitle(e.message.replace(/\s+/g, '\n'));
                else ev.action.setTitle('Unknown error');
            });
        if (!this.timeout) {
            this.timeout = setInterval(() => {
                (async () => {
                    this.setDisplay()
                        .then((e) => {
                            ev.action.setImage(e.img);
                            ev.action.setTitle(e.text);
                        })
                        .catch((e) => {
                            ev.action.setImage('');
                            if (e instanceof Error) ev.action.setTitle(e.message.replace(/\s+/g, '\n'));
                            else ev.action.setTitle('Unknown error');
                        });
                })();
            }, 60000);
        }
    }

    override onWillDisappear(ev: WillDisappearEvent<Settings>): void | Promise<void> {
        if (this.actions.next().done) {
            clearInterval(this.timeout);
            this.timeout = undefined;
        }
    }

    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        this.settings = ev.payload.settings;
        this.client = undefined;
        this.setDisplay()
            .then((e) => {
                ev.action.setImage(e.img);
                ev.action.setTitle(e.text);
            })
            .catch((e) => {
                ev.action.setImage('');
                if (e instanceof Error) ev.action.setTitle(e.message.replace(/\s+/g, '\n'));
                else ev.action.setTitle('Unknown error');
            });
    }
}
