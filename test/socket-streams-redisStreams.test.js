const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const ss = require('../lib/socket-streams');
const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');
const { createAdapter } = require('socket.io-redis-streams-adapter');

describe('Socket Streams', () => {
  let mainServer;
  let mainIo;
  let redisServer;
  let clientSocket;
  let PORT;

  beforeAll(async () => {
    // Create main Socket.IO server
    mainServer = createServer();
    mainIo = new Server(mainServer);

    // Setup Redis clients
    const redisClient = createClient({ url: "redis://localhost:6379" });
    await redisClient.connect();

    // Setup Redis adapter for main server
    mainIo.adapter(createAdapter(redisClient));

    const redisClientSecondary = createClient({ url: "redis://localhost:6379" });
    await redisClientSecondary.connect();
    // Create separate Redis-connected server
    redisServer = new Server();
    redisServer.adapter(createAdapter(redisClientSecondary));

    // Start listening on port 0 (lets OS assign an available port)
    await new Promise(resolve => {
      mainServer.listen(0, () => {
        PORT = mainServer.address().port;
        console.log("***** TEST: Using port", PORT, "*****");
        resolve();
      });
    });
  });

  beforeEach((done) => {
    // Create client socket
    clientSocket = Client(`http://localhost:${PORT}`);
    
    clientSocket.on('connect', () => {
      console.log("***** TEST: Client connected *****");
      done();
    });
  });

  afterEach(() => {
    clientSocket.close();
  });


  test('should successfully transfer a file through redis server to client', (done) => {
    const testContent = Buffer.from('x'.repeat(1024 * 1024)); // 1MB of data
    const tempFilePath = path.join(__dirname, 'test.tmp');
    fs.writeFileSync(tempFilePath, testContent);

    // Set up client file receiver
    ss(clientSocket).on('file', (stream, data) => {
      console.log("***** TEST: Receiving file:", data, "*****");
      let received = 0;
      
      stream.on('data', (chunk) => {
        received += chunk.length;
        const percentage = ((received / data.size) * 100).toFixed(2);
        console.log(`Progress: ${percentage}%`);
      });
      
      const filePath = path.join(__dirname, 'received_' + data.name);
      const writeStream = fs.createWriteStream(filePath);
      stream.pipe(writeStream);
      
      stream.on('end', () => {
        console.log("***** TEST: File received:", filePath, "*****");
        expect(received).toBe(data.size);
        fs.unlinkSync(filePath);
        fs.unlinkSync(tempFilePath);
        done();
      });
    });

    // Simulate Redis server sending file
    try {
      const stats = fs.statSync(tempFilePath);
      const stream = ss(redisServer).createStream();
      
      // Broadcast through Redis
      redisServer.emit('file', stream.channelId, {
        name: 'test.tmp',
        size: stats.size
      });

      // Create read stream and pipe to socket stream
      const fileStream = fs.createReadStream(tempFilePath);
      fileStream.pipe(stream);

    } catch (error) {
      console.error("***** TEST: Error sending file:", error, "*****");
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      done(error);
    }
  });
}); 