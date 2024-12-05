// This is to test the mongo adapter. It is untested as I dont have a replica set setup. If you have a replica set setup, you can run this test and please let me know if it works with a PR or an issue.

const { createServer } = require('http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const ss = require('../lib/socket-streams');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { createAdapter } = require('@socket.io/mongo-adapter');

describe('Socket Streams', () => {
  let mainServer;
  let mainIo;
  let redisServer;
  let clientSocket;
  let PORT;

  beforeAll(async () => {
    try {
      // Create main Socket.IO server
      mainServer = createServer();
      mainIo = new Server(mainServer);

      // Setup MongoDB connection
      const mongoClient = new MongoClient('mongodb://localhost:27017/?replicaSet=rs0');
      console.log("***** TEST: Connecting to MongoDB *****");
      await mongoClient.connect();
      console.log("***** TEST: Connected to MongoDB *****");

      const DB = 'mydb';
      const COLLECTION = 'socket.io-adapter-events';

      try {
        await mongoClient.db(DB).createCollection(COLLECTION, {
          capped: true,
          size: 1e6
        });
      } catch (e) {
        // collection already exists
      }
      const mongoCollection = mongoClient.db(DB).collection(COLLECTION);

      // Setup MongoDB adapter for main server
      mainIo.adapter(createAdapter(mongoCollection));

      // Create separate MongoDB-connected server
      const mongoClientSecondary = new MongoClient('mongodb://localhost:27017/?replicaSet=rs0');
      console.log("***** TEST: Connecting to MongoDB secondary *****");
      await mongoClientSecondary.connect();
      console.log("***** TEST: Connected to MongoDB secondary *****");
      const mongoCollectionSecondary = mongoClientSecondary.db(DB).collection(COLLECTION);

      redisServer = new Server();
      redisServer.adapter(createAdapter(mongoCollectionSecondary));

      // Start listening on port 0 (lets OS assign an available port)
      await new Promise(resolve => {
        mainServer.listen(0, () => {
          PORT = mainServer.address().port;
          console.log("***** TEST: Using port", PORT, "*****");
          resolve();
        });
      });
    } catch (error) {
      console.error("***** TEST: Error connecting to MongoDB:", error, "*****");
      throw error; // Re-throw the error to fail the test
    }
  }, 10000);

  beforeEach((done) => {
    // Create client socket
    clientSocket = Client(`http://localhost:${PORT}`);

    clientSocket.on('connect', () => {
      console.log("***** TEST: Client connected *****");
      done();
    });
  });

  afterEach(() => {
    // Ensure clientSocket is defined before closing
    if (clientSocket) {
      clientSocket.close();
    }
  });

  test('should successfully transfer a file through mongo server to client', (done) => {
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