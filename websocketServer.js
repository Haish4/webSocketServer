const { WebSocketServer } = require("ws");
const http = require("http");
const uuidv4 = require("uuid").v4;
const mysql = require("mysql"); 


const db = mysql.createConnection({
  host: "localhost",
  user: "root", 
  password: "", 
  database: "pm_assignment", 
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error("MySQL connection error:", err);
    return;
  }
  console.log("Connected to MySQL as ID", db.threadId);
});

// Set up HTTP server and WebSocket server
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server running\n");
});

const wsServer = new WebSocketServer({ server });
const port = 8000;

const clients = {};
const usernames = {};

// Function to save messages to the database
function saveMessageToDatabase(username, message) {
  const query = "INSERT INTO messages (username, message) VALUES (?, ?)";
  db.query(query, [username, message], (err, result) => {
    if (err) {
      console.error("Error saving message to database:", err);
      return;
    }
    console.log("Message saved to database with ID:", result.insertId);
  });
}
function saveJoin(username, message) {
  const query = "INSERT INTO messages (username, message, type) VALUES (?, ?, ?)";
  db.query(query, [username, message, "JOIN"], (err, result) => {
    if (err) {
      console.error("Error saving message to database:", err);
      return;
    }
    console.log("Message saved to database with ID:", result.insertId);
  });
}
function saveLeft(username, message) {
  const query = "INSERT INTO messages (username, message, type) VALUES (?, ?, ?)";
  db.query(query, [username, message, "LEFT"], (err, result) => {
    if (err) {
      console.error("Error saving message to database:", err);
      return;
    }
    console.log("Message saved to database with ID:", result.insertId);
  });
}

function processReceivedMessage(message, userId) {
  console.log(`Received message from ${usernames[userId]}: ${message}`);

  // Save the message to the database
  saveMessageToDatabase(usernames[userId], message);

  // Broadcast the message to all connected clients
  for (const [id, client] of Object.entries(clients)) {
    client.send(`${usernames[userId]} says: ${message}`);
  }
}

function handleClientDisconnection(userId) {
  console.log(`${usernames[userId]} disconnected.`);
  
  // Save the "has left" message to the database just like a normal message
  saveLeft(usernames[userId], `${usernames[userId]} has left the chat.`);

  delete clients[userId];
  delete usernames[userId];
}

wsServer.on("connection", function handleNewConnection(connection) {
  const userId = uuidv4();
  console.log("Received a new connection", userId);

  clients[userId] = connection;

  connection.on("message", (message) => {
    if (!usernames[userId]) {
      usernames[userId] = message;
      console.log(`${userId} has set their username to: ${message}`);

      // Save the "has joined" message to the database just like a normal message
      saveJoin(usernames[userId], `${usernames[userId]} has joined the chat.`);

      // Broadcast the "has joined" message to all clients
      for (const [id, client] of Object.entries(clients)) {
        client.send(`${usernames[userId]} has joined the chat.`);
      }
    } else {
      // Save the message to the database and broadcast to all clients
      processReceivedMessage(message, userId);
    }
  });

  connection.on("close", () => {
    // Broadcast the "has left" message to all clients
    for (const [id, client] of Object.entries(clients)) {
      client.send(`${usernames[userId]} has left the chat.`);
    }
    handleClientDisconnection(userId);
  });
});

server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});
