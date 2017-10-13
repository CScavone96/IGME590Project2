const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const index = fs.readFileSync(`${__dirname}/../client/index.html`);

const onRequest = (request, response) => {
  response.writeHead(200, { ContentType: 'text/html' });
  response.write(index);
  response.end();
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on 127.0.0.1: ${port}`);

const io = socketio(app);

let blocks = [];

let block = {};

const users = [];

const points = {};

let draws = {};

let difficulty = 0.92;

let blockCount = 0;

const emitBlock = () => { //Emits new random block to all players
  let newBlock = {};
  const xPos = Math.floor((Math.random() * 500))+6;
  const xSize = Math.floor((Math.random() * (50 - 25)) + 25);
  const ySize = Math.floor((Math.random() * (50 - 25)) + 25);
  const yPos = 0 - ySize;
  let newSpeed = Math.floor((Math.random() * 3)) + 1;
  newBlock = { x: xPos, y: yPos, width: xSize, height: ySize, isBlock: blockCount, speed: newSpeed};
  blockCount++;
  blocks.push(newBlock);
  let keys = Object.keys(blocks);        
  for(let i = 0; i < keys.length; i++){
  newBlock = blocks[keys[i]];
  draws[newBlock.isBlock] = newBlock; 
  }
};

const deleteBlock = (block) =>{ //Removes block from list
        blocks.pop(block);
};

const emitPlayers = () => { //Emits player list and scores to players
  let data = '';
  users.forEach((element) => {
    data = `${data}<li>${element.name} - ${points[element.name]}</li>`;
  });
  io.sockets.in('room1').emit('clientUpdate', data);
};


const onJoined = (sock) => { //Handles player joining and rejects duplicate names
    const socket = sock;
    let nameTaken = false;
    socket.on('join', (data) => 
    {
        for(var i = 0; i < users.length; i++){
            if(users[i].name == data.name){
                nameTaken = true;
            }
        }
        if(!nameTaken)
        {
            socket.name = data.name;
            users.push(socket);
            socket.join('room1');
            points[socket.name] = 0;
            console.log(`${data.name} joined`);
            emitPlayers(socket);
            socket.emit('onJoined', data);
            socket.on('disconnect', () => {
                console.log(users);
                const userInd = users.indexOf(socket.name);
                users.splice(userInd, 1);  
                emitPlayers(socket);
                delete draws[socket.name];
                socket.leave('room1');
            });
        }
        else{
            socket.name = "NAMETAKEN"
            socket.emit('nameTaken');
            socket.disconnect();
        }      
    });
};

const resetPoints = (data) =>{ //Sets points of player to zero
    points[data] = 0;
};

const update = () => { //Updates draw/game data for all connected clients
    let r = Math.random();
    const time = new Date().getTime();
    let keys = Object.keys(draws);
    let drawData = [];
    if(users.length > 0){
        if(r < 1-difficulty)
        {
            emitBlock();
        }
    }
    for(let i = 0; i < keys.length; i++){
        const drawCall = draws[keys[i]];
        draws[keys[i]].lastUpdate = time;
        if(draws[keys[i]].hasOwnProperty("isBlock"))
        {
            draws[keys[i]].y += draws[keys[i]].speed;
        }
        if (draws[keys[i]].y >= 550){
            deleteBlock(keys[i]);
            delete draws[keys[i]];
            users.forEach((element) => {
                points[element.name] = points[element.name] + 1;
            });
        }
        else{
            let newDraw = {name: keys[i], coords: draws[keys[i]]};
            drawData.push(newDraw);
            draws[newDraw.name] = newDraw.coords;
        }
    }   
    emitPlayers();
    io.sockets.in('room1').emit('drawUpdate', drawData);    
};      

io.sockets.on('connection', (socket) => { //Listens for client emits
  onJoined(socket);
  socket.on('blockClicked', (name) => {
    points[name]++;
    block = {};
    emitBlock(socket);
    emitPlayers(socket);
  });
  socket.on('addPlayer', (data) => {
    draws[data.name] = data;
  });
  socket.on('resetPoints', (data) => {
    resetPoints(data);
  });
});

setInterval(update, 17);

console.log('Websocket server started');
