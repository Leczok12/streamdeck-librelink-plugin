import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { GlucoseState } from "./actions/glucose-state";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the increment action.
streamDeck.actions.registerAction(new GlucoseState());

// Finally, connect to the Stream Deck.
streamDeck.connect();
