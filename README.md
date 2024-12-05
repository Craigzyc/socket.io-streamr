# socket.io-streamr

A Socket.IO streaming module that enables efficient file streaming between Socket.IO servers using various adapters. This module is particularly useful for distributed systems where file transfers need to occur across different Socket.IO instances.
This module is inspired by socket.io-stream but supports redis streams.

## Features

- Stream files between Socket.IO servers and clients
- Support for multiple adapters
- Progress tracking for file transfers
- Memory-efficient streaming

## Supported Adapters

- [x] Redis
- [x] Redis Streams
- [ ] Mongo (test included but not tested)


## Installation

```bash
npm install socket.io-streamr
```

## Basic Usage

### Server Side
```javascript
const { Server } = require('socket.io');
const ss = require('socket.io-streamr');
const Redis = require('ioredis');
const { createAdapter } = require('socket.io-redis');

// Setup Socket.IO server
const io = new Server(server);

// Configure Redis adapter
const pubClient = new Redis('redis://localhost:6379');
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));

// Handle file streaming
io.on('connection', (socket) => {
  const stream = ss(socket).createStream();
  
  // Emit file through Redis
  io.emit('file', stream, {
    name: 'example.txt',
    size: fileSize
  });
  
  // Pipe file to stream
  fileStream.pipe(stream);
});
```

### Client Side
```javascript
const { io } = require('socket.io-client');
const ss = require('socket.io-streamr');

const socket = io('http://localhost:3000');

ss(socket).on('file', (stream, data) => {
  // Handle incoming file stream
  let received = 0;
  
  stream.on('data', (chunk) => {
    received += chunk.length;
    const progress = (received / data.size * 100).toFixed(2);
    console.log(`Download progress: ${progress}%`);
  });
  
  // Pipe to destination
  stream.pipe(fs.createWriteStream(data.name));
});
```


## API Reference

### Server-side Methods

- `ss(socket).createStream(options)`: Creates a new stream for file transfer
- `ss(socket).emit(event, stream, data)`: Emits a stream with associated metadata

### Client-side Methods

- `ss(socket).on(event, callback)`: Listens for incoming streams
- `stream.on('data', callback)`: Handles chunks of incoming data
- `stream.on('end', callback)`: Triggered when stream ends

### Note about Client and Server
Either side can be used as the source or destination of the stream. The Client and Server usage is just an example but works either way

## Testing

```bash
npm install
npm test
```

## Debugging

To see the debug logs, set the environment variable `DEBUG` to `socket.io-streamr:*`
example: `DEBUG=socket.io-streamr:* npm test`


## License

This project is licensed under the Apache License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- socket.io-stream for the original idea
