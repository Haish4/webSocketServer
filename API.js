const express = require("express");
const cors = require("cors");
const { createClient } = require("@libsql/client");
const { WebSocketServer } = require("ws");
const http = require("http");
const uuidv4 = require("uuid").v4;

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create an HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = new WebSocketServer({ server });
const clients = {};
const usernames = {};

// Create a connection to your Turso database
const db = createClient({
  url: "libsql://pm-haisha.aws-eu-west-1.turso.io", // Replace with your actual Turso URL
  authToken:
    "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJleHAiOjE3Mzc1MDgxNDgsImlhdCI6MTczNjkwMzM0OCwiaWQiOiIyOWJhNWY2OS1mZGYwLTQ4YWEtODkwZi1iYzVlYjZiMWY0MzEiLCJyaWQiOiJmYjM3YzU1OS00MDFlLTQxNjktOTM0Yy0xZDY0NzZmY2MwNTAifQ.CbgGN7OAC10R_kXQhugV5Ejxzjgr7SxxXrPvW9jkzjr09GL3J69Rw7lhBfyyjcqByJ2N_nJzHtTzuCJs0eM8DA", // Replace with your actual Turso auth token
});

// Test the database connection
db.execute("SELECT 1")
  .then(() => {
    console.log("Connected to Turso database");
  })
  .catch((err) => {
    console.error("Failed to connect to Turso database:", err.message);
    console.error("Error details:", err);
  });

// REST API Endpoints

// Get all ideas
app.get("/api/idea", async (req, res) => {
  try {
    const results = await db.execute("SELECT * FROM ideas");
    res.json(results.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "An error occurred while fetching ideas" });
  }
});

// Add a new idea
app.post("/api/idea", async (req, res) => {
  const { userName, category, idea } = req.body;

  if (!userName || !category || !idea) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const result = await db.execute({
      sql: "INSERT INTO ideas (userName, category, idea) VALUES (?, ?, ?)",
      args: [userName, category, idea],
    });
    res
      .status(201)
      .json({ id: result.lastInsertRowid, userName, category, idea });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "An error occurred while inserting the idea" });
  }
});

// Get all calendar events
app.get("/api/calendarEvent", async (req, res) => {
  try {
    const results = await db.execute("SELECT * FROM events");
    res.json(results.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "An error occurred while fetching events" });
  }
});

// Add a new calendar event
app.post("/api/calendarEvent", async (req, res) => {
  const { title, start, end, description, location, link, color } = req.body;

  if (!title || !start || !end) {
    return res
      .status(400)
      .json({ error: "title, start, and end date fields are required" });
  }

  try {
    const result = await db.execute({
      sql: "INSERT INTO events (title, start, end, description, location, link, color) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [title, start, end, description, location, link, color],
    });
    res.status(201).json({
      id: result.lastInsertRowid,
      title,
      start,
      end,
      description,
      location,
      link,
      color,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "An error occurred while inserting the event" });
  }
});

// Get all global chat messages
app.get("/api/globalChat", async (req, res) => {
  try {
    const results = await db.execute("SELECT * FROM messages");
    res.json(results.rows);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "An error occurred while fetching messages" });
  }
});

// WebSocket Server Logic

// Save a message to the database
async function saveMessageToDatabase(username, message) {
  try {
    const result = await db.execute({
      sql: "INSERT INTO messages (username, message) VALUES (?, ?)",
      args: [username, message],
    });
    console.log("Message saved to database with ID:", result.lastInsertRowid);
  } catch (err) {
    console.error("Error saving message to database:", err);
  }
}

// Save a join event to the database
async function saveJoin(username, message) {
  try {
    const result = await db.execute({
      sql: "INSERT INTO messages (username, message, type) VALUES (?, ?, ?)",
      args: [username, message, "JOIN"],
    });
    console.log(
      "Join message saved to database with ID:",
      result.lastInsertRowid
    );
  } catch (err) {
    console.error("Error saving join message to database:", err);
  }
}

// Save a leave event to the database
async function saveLeft(username, message) {
  try {
    const result = await db.execute({
      sql: "INSERT INTO messages (username, message, type) VALUES (?, ?, ?)",
      args: [username, message, "LEFT"],
    });
    console.log(
      "Leave message saved to database with ID:",
      result.lastInsertRowid
    );
  } catch (err) {
    console.error("Error saving leave message to database:", err);
  }
}

// Process received WebSocket messages
function processReceivedMessage(message, userId) {
  console.log(`Received message from ${usernames[userId]}: ${message}`);
  saveMessageToDatabase(usernames[userId], message);

  for (const [id, client] of Object.entries(clients)) {
    client.send(`${usernames[userId]} says: ${message}`);
  }
}

// Handle client disconnection
function handleClientDisconnection(userId) {
  console.log(`${usernames[userId]} disconnected.`);
  saveLeft(usernames[userId], `${usernames[userId]} has left the chat.`);

  delete clients[userId];
  delete usernames[userId];
}

// WebSocket connection handler
wsServer.on("connection", function handleNewConnection(connection) {
  const userId = uuidv4();
  console.log("Received a new connection", userId);

  clients[userId] = connection;

  connection.on("message", (message) => {
    if (!usernames[userId]) {
      usernames[userId] = message.toString();
      console.log(`${userId} has set their username to: ${usernames[userId]}`);
      saveJoin(usernames[userId], `${usernames[userId]} has joined the chat.`);

      for (const [id, client] of Object.entries(clients)) {
        client.send(`${usernames[userId]} has joined the chat.`);
      }
    } else {
      processReceivedMessage(message.toString(), userId);
    }
  });

  connection.on("close", () => {
    handleClientDisconnection(userId);
  });
});

// Start the server
const port = 3333;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
