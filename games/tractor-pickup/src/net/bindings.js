// src/net/bindings.js
// The replicated kinds this game sends (M-22), one row each: { kind, read(at) -> [[id, rec], ...] }, at = { game, roster, you }. The host sends
// every kind whose authority is 'host'; each device sends its own object of every 'owner' kind (the host passes a guest's on). A guest keeps
// every kind in its store; guest.js shows the ones the game draws, in this order (the players before their trains). A new kind of shared object
// is a kind (kinds.js) and a row here: no new message.
import { createRegistry } from './replica.js';
import { ANIMAL, TREE, PLAYER, TRAIN, animalRecords, treeRecords, playerRecords } from './kinds.js';
import { trainRecord } from './players.js';
import { MAX_PLAYERS } from './protocol.js';

export const BINDINGS = [
  { kind: ANIMAL, read: at => animalRecords(at.game.herd) },
  { kind: TREE, read: at => treeRecords(at.game.trees) },
  { kind: PLAYER, read: at => playerRecords(at.roster) },
  { kind: TRAIN, read: at => [[at.you, trainRecord(at.game)]] },
];
export const ofAuthority = (rows, authority) => rows.filter(b => b.kind.authority === authority);
export const registryOf = rows => createRegistry(rows.map(b => b.kind), { maxSender: MAX_PLAYERS });
export const readAll = (rows, at) => Object.fromEntries(rows.map(b => [b.kind.name, b.read(at)])); // the tracker's input: { kindName: [[id, rec], ...] }
