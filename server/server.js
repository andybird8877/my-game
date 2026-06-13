import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createInitialState, processTurn, processUlt, resolveBeforeTurn } from '../shared/combat.js'
import { CHARACTERS } from '../shared/characters.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const app  = express()
const http = createServer(app)
const io   = new Server(http, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
})

// Serve the built React app in production
app.use(express.static(join(__dirname, '../dist')))
// Catch-all: send index.html for any non-socket route (client-side routing)
app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next()
  res.sendFile(join(__dirname, '../dist/index.html'))
})

const PORT = process.env.PORT || 3001

// ─── Room state ──────────────────────────────────────────────────────────────
//
// rooms[roomId] = {
//   players: [socketId, socketId?],   // [0]=P1, [1]=P2
//   phase:   'waiting' | 'char_select' | 'game' | 'done',
//   chars:   [charId|null, charId|null],
//   gameState: object | null,
//   pendingMoves: { [socketId]: { move, readActive, useBloodletter, useUlt } }
// }

const rooms = {}

function roomOf(socketId) {
  return Object.entries(rooms).find(([, r]) => r.players.includes(socketId))
}

function playerIndex(room, socketId) {
  return room.players.indexOf(socketId)
}

// Emit full room snapshot to both players in a room
function broadcast(roomId) {
  const room = rooms[roomId]
  if (!room) return

  room.players.forEach((sid, idx) => {
    if (!sid) return
    io.to(sid).emit('room_state', {
      phase:       room.phase,
      roomId,
      myIndex:     idx,                        // 0 = P1, 1 = P2
      chars:        room.chars,               // [p1CharId|null, p2CharId|null]
      gameState:    room.gameState,
      pendingMove:  !!room.pendingMoves[sid], // has this player submitted a move?
      opponentReady: !!room.pendingMoves[room.players[1 - idx]], // has opponent submitted?
    })
  })
}

// ─── Connection ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`)

  // ── Create room ────────────────────────────────────────────────────────────
  socket.on('create_room', () => {
    const roomId = randomUUID().slice(0, 8).toUpperCase()
    rooms[roomId] = {
      players:      [socket.id, null],
      phase:        'waiting',
      chars:        [null, null],
      gameState:    null,
      pendingMoves: {},
    }
    socket.join(roomId)
    socket.emit('room_created', { roomId })
    console.log(`[room] ${roomId} created by ${socket.id}`)
  })

  // ── Join room ──────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId }) => {
    const room = rooms[roomId]
    if (!room) {
      socket.emit('error', { message: 'Room not found.' })
      return
    }
    if (room.players[1]) {
      socket.emit('error', { message: 'Room is full.' })
      return
    }
    room.players[1] = socket.id
    room.phase = 'char_select'
    socket.join(roomId)
    console.log(`[room] ${roomId} joined by ${socket.id}`)
    broadcast(roomId)
  })

  // ── Select character ───────────────────────────────────────────────────────
  socket.on('select_char', ({ charId }) => {
    const entry = roomOf(socket.id)
    if (!entry) return
    const [roomId, room] = entry

    if (room.phase !== 'char_select') return

    const idx = playerIndex(room, socket.id)
    room.chars[idx] = charId
    console.log(`[room] ${roomId} P${idx + 1} selected char ${charId}`)

    // Both selected → start game
    if (room.chars[0] !== null && room.chars[1] !== null) {
      const c1 = CHARACTERS.find(c => c.id === room.chars[0])
      const c2 = CHARACTERS.find(c => c.id === room.chars[1])
      if (!c1 || !c2) {
        io.to(roomId).emit('error', { message: 'Invalid character selection.' })
        return
      }
      room.gameState = createInitialState(c1, c2)
      room.phase = 'game'
      console.log(`[room] ${roomId} game started: ${c1.name} vs ${c2.name}`)
    }

    broadcast(roomId)
  })

  // ── Submit move ────────────────────────────────────────────────────────────
  socket.on('submit_move', ({ move, readActive, useBloodletter, useUlt }) => {
    const entry = roomOf(socket.id)
    if (!entry) return
    const [roomId, room] = entry

    if (room.phase !== 'game') return
    if (!['AT', 'BL', 'SP'].includes(move) && !useUlt) return

    // Don't overwrite an already-submitted move
    if (room.pendingMoves[socket.id]) return

    room.pendingMoves[socket.id] = { move, readActive: !!readActive, useBloodletter: !!useBloodletter, useUlt: !!useUlt }
    console.log(`[room] ${roomId} P${playerIndex(room, socket.id) + 1} submitted: ${useUlt ? 'ULT' : move}`)

    const [p1sid, p2sid] = room.players

    // Both submitted → process turn
    if (room.pendingMoves[p1sid] && room.pendingMoves[p2sid]) {
      const p1Input = room.pendingMoves[p1sid]
      const p2Input = room.pendingMoves[p2sid]
      room.pendingMoves = {}

      let gs = room.gameState

      // ── Resolve ULTs ──────────────────────────────────────────────────────
      // If either player ULTs, handle before normal turn.
      // Priority: P1 > P2. ULT replaces the normal turn for that player.
      const p1Ulting = p1Input.useUlt && gs.p1.ultimateReady
      const p2Ulting = p2Input.useUlt && gs.p2.ultimateReady

      if (p1Ulting || p2Ulting) {
        // P1 priority when both ULT simultaneously
        const ultUser = p1Ulting ? 'p1' : 'p2'
        gs = processUlt(gs, ultUser)           // returns new state directly
        room.gameState = gs
        room.phase = gs.winner ? 'done' : 'game'
        broadcast(roomId)
        return
      }

      // ── Resolve between-turns effects then normal turn ────────────────────
      const beforeSteps = resolveBeforeTurn(gs)
      if (beforeSteps.length > 0) {
        gs = beforeSteps[beforeSteps.length - 1].stateAfter
      }

      gs = processTurn(
        gs,
        p1Input.move,
        p2Input.move,
        p1Input.readActive,
        p2Input.readActive,
        { p1UseBloodletter: p1Input.useBloodletter, p2UseBloodletter: p2Input.useBloodletter },
      )

      room.gameState = gs
      room.phase = gs.winner ? 'done' : 'game'
      console.log(`[room] ${roomId} turn processed. Winner: ${gs.winner ?? 'none'}`)
    }

    broadcast(roomId)
  })

  // ── Rematch / change chars ─────────────────────────────────────────────────
  socket.on('rematch', () => {
    const entry = roomOf(socket.id)
    if (!entry) return
    const [roomId, room] = entry
    if (room.phase !== 'done') return

    const c1 = CHARACTERS.find(c => c.id === room.chars[0])
    const c2 = CHARACTERS.find(c => c.id === room.chars[1])
    room.gameState = createInitialState(c1, c2)
    room.phase = 'game'
    room.pendingMoves = {}
    broadcast(roomId)
  })

  socket.on('change_chars', () => {
    const entry = roomOf(socket.id)
    if (!entry) return
    const [roomId, room] = entry

    room.phase = 'char_select'
    room.chars = [null, null]
    room.gameState = null
    room.pendingMoves = {}
    broadcast(roomId)
  })

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`)
    const entry = roomOf(socket.id)
    if (!entry) return
    const [roomId, room] = entry

    const idx = playerIndex(room, socket.id)
    const otherSid = room.players[1 - idx]

    // Notify other player
    if (otherSid) {
      io.to(otherSid).emit('opponent_disconnected')
    }

    // Clean up room
    delete rooms[roomId]
    console.log(`[room] ${roomId} closed`)
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────

http.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
