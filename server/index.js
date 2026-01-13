// Metal Server - User Registration, Discovery, and Message Relay
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// In-memory storage (replace with database in production)
const users = new Map(); // metalId -> user data
const sessions = new Map(); // token -> metalId
const pendingMessages = new Map(); // metalId -> messages[]
const wsConnections = new Map(); // metalId -> WebSocket

// ============ Helper Functions ============

function generateToken() {
  return uuidv4() + '-' + Date.now().toString(36);
}

function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  return sessions.get(token) || null;
}

// ============ REST API Routes ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    users: users.size,
    connections: wsConnections.size
  });
});

// Register new user
app.post('/api/users/register', (req, res) => {
  try {
    const { metalId, displayName, publicKey } = req.body;

    if (!metalId || !displayName || !publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: metalId, displayName, publicKey'
      });
    }

    // Check if metalId already exists
    if (users.has(metalId)) {
      return res.status(409).json({
        success: false,
        error: 'Metal ID already registered'
      });
    }

    // Create user
    const user = {
      metalId,
      displayName,
      publicKey,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      isOnline: false
    };

    users.set(metalId, user);

    // Generate session token
    const token = generateToken();
    sessions.set(token, metalId);

    console.log(`[Register] New user: ${metalId} (${displayName})`);

    res.json({
      success: true,
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Authenticate existing user
app.post('/api/users/auth', (req, res) => {
  try {
    const { metalId, publicKey, signature } = req.body;

    if (!metalId || !publicKey) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const user = users.get(metalId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify public key matches (simple check - in production use signature verification)
    if (user.publicKey !== publicKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last seen
    user.lastSeen = Date.now();
    users.set(metalId, user);

    // Generate new session token
    const token = generateToken();
    sessions.set(token, metalId);

    console.log(`[Auth] User authenticated: ${metalId}`);

    res.json({
      success: true,
      data: {
        user,
        token
      }
    });
  } catch (error) {
    console.error('[Auth] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get user by Metal ID
app.get('/api/users/:metalId', (req, res) => {
  try {
    const { metalId } = req.params;
    const user = users.get(metalId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is online
    const isOnline = wsConnections.has(metalId);

    res.json({
      success: true,
      data: {
        ...user,
        isOnline
      }
    });
  } catch (error) {
    console.error('[GetUser] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Search users
app.get('/api/users', (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    let results = Array.from(users.values());

    if (q) {
      const query = q.toLowerCase();
      results = results.filter(user => 
        user.metalId.toLowerCase().includes(query) ||
        user.displayName.toLowerCase().includes(query)
      );
    }

    // Add online status
    results = results.map(user => ({
      ...user,
      isOnline: wsConnections.has(user.metalId)
    }));

    // Limit results
    results = results.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        users: results,
        total: results.length
      }
    });
  } catch (error) {
    console.error('[SearchUsers] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Update user profile
app.put('/api/users/me', (req, res) => {
  try {
    const metalId = authenticateRequest(req);
    if (!metalId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const user = users.get(metalId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const { displayName } = req.body;
    if (displayName) {
      user.displayName = displayName;
    }

    user.lastSeen = Date.now();
    users.set(metalId, user);

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('[UpdateUser] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Send message (HTTP fallback)
app.post('/api/messages', (req, res) => {
  try {
    const metalId = authenticateRequest(req);
    if (!metalId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { toMetalId, encryptedContent, type = 'message' } = req.body;

    if (!toMetalId || !encryptedContent) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const message = {
      id: uuidv4(),
      fromMetalId: metalId,
      toMetalId,
      encryptedContent,
      timestamp: Date.now(),
      type
    };

    // Try to deliver via WebSocket
    const recipientWs = wsConnections.get(toMetalId);
    if (recipientWs && recipientWs.readyState === 1) {
      recipientWs.send(JSON.stringify({
        type: 'message',
        payload: message
      }));
      console.log(`[Message] Delivered to ${toMetalId} via WebSocket`);
    } else {
      // Queue for later delivery
      const queue = pendingMessages.get(toMetalId) || [];
      queue.push(message);
      pendingMessages.set(toMetalId, queue);
      console.log(`[Message] Queued for ${toMetalId}`);
    }

    res.json({
      success: true,
      data: { messageId: message.id }
    });
  } catch (error) {
    console.error('[SendMessage] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get pending messages
app.get('/api/messages/pending', (req, res) => {
  try {
    const metalId = authenticateRequest(req);
    if (!metalId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const messages = pendingMessages.get(metalId) || [];
    pendingMessages.delete(metalId);

    res.json({
      success: true,
      data: { messages }
    });
  } catch (error) {
    console.error('[GetPending] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============ HTTP Server ============

const server = createServer(app);

// ============ WebSocket Server ============

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  let authenticatedMetalId = null;

  console.log('[WS] New connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'auth': {
          const { token } = message.payload;
          const metalId = sessions.get(token);
          
          if (metalId) {
            authenticatedMetalId = metalId;
            wsConnections.set(metalId, ws);
            
            // Update user online status
            const user = users.get(metalId);
            if (user) {
              user.isOnline = true;
              user.lastSeen = Date.now();
              users.set(metalId, user);
            }

            // Send auth success
            ws.send(JSON.stringify({
              type: 'auth',
              payload: { success: true, metalId }
            }));

            // Deliver pending messages
            const pending = pendingMessages.get(metalId) || [];
            if (pending.length > 0) {
              pending.forEach(msg => {
                ws.send(JSON.stringify({
                  type: 'message',
                  payload: msg
                }));
              });
              pendingMessages.delete(metalId);
              console.log(`[WS] Delivered ${pending.length} pending messages to ${metalId}`);
            }

            // Broadcast presence to contacts
            broadcastPresence(metalId, true);
            
            console.log(`[WS] Authenticated: ${metalId}`);
          } else {
            ws.send(JSON.stringify({
              type: 'auth',
              payload: { success: false, error: 'Invalid token' }
            }));
          }
          break;
        }

        case 'message': {
          if (!authenticatedMetalId) {
            ws.send(JSON.stringify({
              type: 'error',
              payload: { error: 'Not authenticated' }
            }));
            return;
          }

          const { toMetalId, encryptedContent, id } = message.payload;
          const msgId = id || uuidv4();

          const serverMessage = {
            id: msgId,
            fromMetalId: authenticatedMetalId,
            toMetalId,
            encryptedContent,
            timestamp: Date.now(),
            type: 'message'
          };

          // Try to deliver
          const recipientWs = wsConnections.get(toMetalId);
          if (recipientWs && recipientWs.readyState === 1) {
            recipientWs.send(JSON.stringify({
              type: 'message',
              payload: serverMessage
            }));

            // Send delivery confirmation
            ws.send(JSON.stringify({
              type: 'ack',
              payload: { messageId: msgId, status: 'delivered' }
            }));
          } else {
            // Queue message
            const queue = pendingMessages.get(toMetalId) || [];
            queue.push(serverMessage);
            pendingMessages.set(toMetalId, queue);

            ws.send(JSON.stringify({
              type: 'ack',
              payload: { messageId: msgId, status: 'queued' }
            }));
          }
          break;
        }

        case 'typing': {
          if (!authenticatedMetalId) return;

          const { toMetalId, isTyping } = message.payload;
          const recipientWs = wsConnections.get(toMetalId);
          
          if (recipientWs && recipientWs.readyState === 1) {
            recipientWs.send(JSON.stringify({
              type: 'typing',
              payload: { fromMetalId: authenticatedMetalId, isTyping }
            }));
          }
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        default:
          console.log(`[WS] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WS] Message error:', error);
    }
  });

  ws.on('close', () => {
    if (authenticatedMetalId) {
      wsConnections.delete(authenticatedMetalId);
      
      // Update user offline status
      const user = users.get(authenticatedMetalId);
      if (user) {
        user.isOnline = false;
        user.lastSeen = Date.now();
        users.set(authenticatedMetalId, user);
      }

      // Broadcast presence
      broadcastPresence(authenticatedMetalId, false);
      
      console.log(`[WS] Disconnected: ${authenticatedMetalId}`);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error);
  });
});

function broadcastPresence(metalId, isOnline) {
  // For simplicity, broadcast to all connected users
  // In production, only broadcast to contacts
  wsConnections.forEach((ws, id) => {
    if (id !== metalId && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'presence',
        payload: { metalId, isOnline }
      }));
    }
  });
}

// ============ Start Server ============

server.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                    METAL SERVER                          ║
║                  Secure Messaging API                    ║
╠══════════════════════════════════════════════════════════╣
║  HTTP API:  http://${HOST}:${PORT}/api                       ║
║  WebSocket: ws://${HOST}:${PORT}/ws                          ║
╠══════════════════════════════════════════════════════════╣
║  Endpoints:                                              ║
║  • POST /api/users/register  - Register new user         ║
║  • POST /api/users/auth      - Authenticate user         ║
║  • GET  /api/users/:metalId  - Get user by Metal ID      ║
║  • GET  /api/users?q=search  - Search users              ║
║  • POST /api/messages        - Send message (HTTP)       ║
║  • GET  /api/messages/pending - Get pending messages     ║
╚══════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  wss.clients.forEach(client => client.close());
  server.close(() => {
    console.log('[Server] Goodbye!');
    process.exit(0);
  });
});
