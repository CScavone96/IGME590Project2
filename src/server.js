const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const index = fs.readFileSync(`${__dirname}/../client/index.html`);

const cssFile = fs.readFileSync(`${__dirname}/../client/css/style.css`);

const onRequest = (request, response) => {
  console.log(request.url);
  switch (request.url) {
    case '/css/style.css':
      response.writeHead(200, { ContentType: 'text/css' });
      response.write(cssFile);
      break;
    default:
      response.writeHead(200, { ContentType: 'text/html' });
      response.write(index);
      break;
  }
  response.end();
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on 127.0.0.1: ${port}`);

const io = socketio(app);

const blocks = [];

const users = [];

const points = {};

const draws = {};

const minDifficulty = 0.02;
const maxDifficulty = 0.075;
let difficulty = minDifficulty;

let blockCount = 0;

const emitBlock = () => { // Emits new random block to all players
  let newBlock = {};
  const xPos = Math.floor((Math.random() * 500)) + 6;
  const xSize = Math.floor((Math.random() * (50 - 25)) + 25);
  const ySize = Math.floor((Math.random() * (50 - 25)) + 25);
  const yPos = 0 - ySize;
  const newSpeed = (Math.floor((Math.random() * 95)) + 25) * difficulty;
  newBlock = { x: xPos,
    y: yPos,
    width: xSize,
    height: ySize,
    isBlock: blockCount,
    speed: newSpeed };
  blockCount++;
  blocks.push(newBlock);
  const keys = Object.keys(blocks);
  for (let i = 0; i < keys.length; i++) {
    newBlock = blocks[keys[i]];
    draws[newBlock.isBlock] = newBlock;
  }
};

const deleteBlock = (block) => { // Removes block from list
  blocks.pop(block);
};

const emitPlayers = () => { // Emits player list and scores to players
  let data = '';
  users.forEach((element) => {
    data = `${data}<li>${element.name} - ${points[element.name]}</li>`;
  });
  io.sockets.in('room1').emit('clientUpdate', data);
};


const onJoined = (sock) => { // Handles player joining and rejects duplicate names
  const socket = sock;
  let nameTaken = false;
  socket.on('join', (data) => {
    for (let i = 0; i < users.length; i++) {
      if (users[i].name === data.name) {
        nameTaken = true;
      }
    }
    if (!nameTaken) {
      socket.name = data.name;
      users.push(socket);
      socket.join('room1');
      points[socket.name] = 0;
      console.log(`${data.name} joined`);
      emitPlayers(socket);
      socket.emit('onJoined', data);
      socket.on('disconnect', () => {
        io.sockets.in('room1').emit('removePlayer', socket.name);
        const userInd = users.indexOf(socket.name);
        users.splice(userInd, 1);
        emitPlayers(socket);
        delete draws[socket.name];
        socket.leave('room1');
      });
    } else {
      socket.name = 'NAMETAKEN';
      socket.emit('nameTaken');
      socket.disconnect();
    }
  });
};

const addPoints = (value) => { // Add points, scaling by difficulty
  points[value.name] += Math.round(100 * difficulty);
};

const resetPoints = (data) => { // Sets points of player to zero
  points[data.name] = 0;
  if (difficulty > minDifficulty) {
    difficulty -= (0.0009 / users.length);
  }
  io.sockets.in('room1').emit('setBGColor', data.color);
};

const update = () => { // Updates draw/game data for all connected clients
  const r = Math.random();
  const time = new Date().getTime();
  const keys = Object.keys(draws);
  const drawData = [];
  if (users.length > 0) {
    if (difficulty < maxDifficulty) {
      difficulty += 0.000007;
    }
    if (r > 1 - difficulty) {
      emitBlock();
    }
  } else {
    difficulty = minDifficulty;
  }
  for (let i = 0; i < keys.length; i++) {
    draws[keys[i]].lastUpdate = time;
    if (draws[keys[i]].isBlock !== -1) {
      draws[keys[i]].y += draws[keys[i]].speed;
    }
    if (draws[keys[i]].y >= 550) {
      deleteBlock(keys[i]);
      delete draws[keys[i]];
      users.forEach(addPoints);
    } else {
      const newDraw = { name: keys[i], coords: draws[keys[i]] };
      drawData.push(newDraw);
      draws[newDraw.name] = newDraw.coords;
    }
  }
  emitPlayers();
  io.sockets.in('room1').emit('drawUpdate', { draws: drawData, diff: (100 / (maxDifficulty - minDifficulty)) * (difficulty - minDifficulty) });
};

io.sockets.on('connection', (socket) => { // Listens for client emits
  onJoined(socket);
  socket.on('addPlayer', (data) => {
    draws[data.name] = data;
  });
  socket.on('resetPoints', (data) => {
    resetPoints(data);
  });
});

setInterval(update, 17);

console.log('Websocket server started');
