const shortid = require('shortid');
const { Readable, Writable } = require('stream');
const debug = require('debug')('socket.io-streamr');

function createStream(socket) {
    const channelId = shortid.generate();
    debug("***** STREAM: Creating new stream channel:", channelId, "*****");

    const stream = new Writable({
        write: (chunk, encoding, callback) => {
            socket.emit(`stream:${channelId}:data`, chunk);
            callback();
        },
        final: (callback) => {
            socket.emit(`stream:${channelId}:end`);
            debug("***** STREAM: Stream ended:", channelId, "*****");
            callback();
        }
    });

    // Attach the channel ID to the stream for reference
    stream.channelId = channelId;

    return stream;
}

function attachStreamHandler(socket, event, callback) {
    socket.on(event, (channelId, ...args) => {
        debug("***** STREAM: Creating receiver for channel:", channelId, "*****");
        
        const stream = new Readable({
            read() {} // Implementation provided by push()
        });

        socket.on(`stream:${channelId}:data`, (chunk) => {
            stream.push(chunk);
        });

        socket.on(`stream:${channelId}:end`, () => {
            stream.push(null);
            socket.removeAllListeners(`stream:${channelId}:data`);
            socket.removeAllListeners(`stream:${channelId}:end`);
        });

        callback(stream, ...args);
    });
}

module.exports = function(sio) {
    // Return if already wrapped
    if (sio.createStream) {
        return sio;
    }

    // Create a wrapper object to avoid modifying the socket directly
    const wrapper = {
        createStream: () => createStream(sio),
        on: (event, callback) => {
            attachStreamHandler(sio, event, callback);
            return wrapper;
        }
    };

    return wrapper;
};