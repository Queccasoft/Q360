import { Buffer } from 'buffer';
import Process from 'process';
import EventEmitter from 'events';

window.Buffer = Buffer;
window.process = Process;
window.EventEmitter = EventEmitter;
window.global = window;

// Define a minimal nextTick if it's missing
if (!window.process.nextTick) {
    window.process.nextTick = (fn, ...args) => {
        setTimeout(() => fn(...args), 0);
    };
}