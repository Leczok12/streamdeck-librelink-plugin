import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { GlucoseState } from './actions/glucose-state';

streamDeck.logger.setLevel(LogLevel.TRACE);
streamDeck.actions.registerAction(new GlucoseState());
streamDeck.connect();
