require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const request = require('request'); // For downloading images
const { OBSWebSocket } = require('obs-websocket-js');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');

const app = express();
const httpServer = createServer(app);

//use express to parse json
app.use(express.json());

//create obs instance
const obs = new OBSWebSocket();

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

// API route to save member avatars
app.post('/saveMemberAvatars', (req, res) => {
    const imageUrls = req.body.imageUrls;
    const avatarFilePaths = {}; // Use an object to store userId -> filePath mapping

    const avatarsDir = path.join(__dirname, 'memberAvatars');

    // Ensure the directory exists and clear old files
    if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir);
    } else {
        fs.readdir(avatarsDir, (err, files) => {
            if (err) {
                console.error('Error reading directory:', err);
                return;
            }
            files.forEach(file => {
                fs.unlinkSync(path.join(avatarsDir, file));
            });
        });
    }

    let processedCount = 0; // Track completed downloads

    imageUrls.forEach(({ url, userId }) => {
        const fileName = `${userId}.jpg`;
        const filePath = path.join(avatarsDir, fileName);

        // Download the image and save it
        request(url)
            .pipe(fs.createWriteStream(filePath))
            .on('finish', () => {
                avatarFilePaths[userId] = filePath;
                processedCount++;
                console.log(`Downloaded and saved image for userId ${userId} to ${filePath}`);
                
                // Send the response when all images are processed
                if (processedCount === imageUrls.length) {
                    res.json({ avatarFilePaths });
                }
            })
            .on('error', err => {
                console.error(`Error downloading image for userId ${userId}:`, err);
            });
    });
});
// app.post('/saveMemberAvatars', (req, res) => {
//     const imageUrls = req.body.imageUrls;
//     const avatarFilePaths = [];
    
//     // Assuming the images are saved in a 'memberAvatars' folder
//     const avatarsDir = path.join(__dirname, 'memberAvatars');
    
//     // Create the folder if it doesn't exist
//     if (!fs.existsSync(avatarsDir)) {
//       fs.mkdirSync(avatarsDir);
//     }else {
//         //empty the folder
//         fs.readdir(avatarsDir, (err, files) => {
//             if (err) {
//                 console.error('Error reading directory:', err);
//                 return;
//             }
//             files.forEach(file => {
//                 const filePath = path.join(avatarsDir, file);
//                 fs.unlink(filePath, err => {
//                     if (err) {
//                         console.error('Error deleting file:', err);
//                     }
//                 });
//             });
//         });
//     }
  
//     // Iterate over each image URL and download the image
//     imageUrls.forEach((url) => {
//       const fileName = `${url.userId}.jpg`; // Use a unique name for each file
//       const filePath = path.join(avatarsDir, fileName);
  
//       // Download the image and save it
//       request(url.url)
//         .pipe(fs.createWriteStream(filePath))
//         .on('finish', () => {
//             //push filepathto array
//             avatarFilePaths.push(filePath);

//             // avatarFilePaths.push(fullPath);
//         //   avatarFilePaths.push(`/memberAvatars/${fileName}`);
  
//           // Send the response when all images are saved
//           if (avatarFilePaths.length === imageUrls.length) {
//             res.json({ avatarFilePaths });
//           }
//         });
//     });
//   });
  
  // Serve the images from the 'memberAvatars' folder
  app.use('/memberAvatars', express.static(path.join(__dirname, 'memberAvatars')));


// Connect to OBS WebSocket function
async function connectToOBS() {
    //check if obs is already connected
    if (obs._socket && obs._socket.readyState === 1) {
        console.log('Already connected to OBS');
        return;
    }
    try {
        // Connect to OBS WebSocket
        await obs.connect(
            process.env.OBS_ADDRESS || 'ws://localhost:4455',
            process.env.OBS_PASSWORD || ''
        );
        console.log('Connected to OBS WebSocket');
    } catch (error) {
        console.error('Failed to connect to OBS WebSocket:', error);
    }
}

io.on('connection', (socket) => {
    let tiktokConnectionWrapper;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);
    // connectToOBS();
    socket.on('setUniqueId', (uniqueId, options) => {

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object' && options) {
            // delete options.requestOptions;
            // delete options.websocketOptions;
        } else {
            options = {};
        }

        // Session ID in .env file is optional
        if (process.env.SESSIONID) {
            options.sessionId = process.env.SESSIONID;
            console.info('Using SessionId');
        }

        // Check if rate limit exceeded
        if (process.env.ENABLE_RATE_LIMIT && clientBlocked(io, socket)) {
            socket.emit('tiktokDisconnected', 'You have opened too many connections or made too many connection requests. Please reduce the number of connections/requests or host your own server instance. The connections are limited to avoid that the server IP gets blocked by TokTok.');
            return;
        }

        // Connect to the given username (uniqueId)
        try {
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            socket.emit('tiktokDisconnected', err.toString());
            return;
        }

        // Redirect wrapper control events once
        tiktokConnectionWrapper.once('connected', state => socket.emit('tiktokConnected', state));
        tiktokConnectionWrapper.once('disconnected', reason => socket.emit('tiktokDisconnected', reason));

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));

        // Redirect message events
        tiktokConnectionWrapper.connection.on('rawData', (messageTypeName, binary) => {
            socket.emit('rawData', messageTypeName, binary);
        })
        tiktokConnectionWrapper.connection.on('roomUser', msg => socket.emit('roomUser', msg));
        tiktokConnectionWrapper.connection.on('member', msg => socket.emit('member', msg));
        tiktokConnectionWrapper.connection.on('chat', msg => socket.emit('chat', msg));
        tiktokConnectionWrapper.connection.on('gift', msg => socket.emit('gift', msg));
        tiktokConnectionWrapper.connection.on('social', msg => socket.emit('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => socket.emit('like', msg));
        tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
        tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
        tiktokConnectionWrapper.connection.on('emote', msg => socket.emit('emote', msg));
        tiktokConnectionWrapper.connection.on('envelope', msg => socket.emit('envelope', msg));
        tiktokConnectionWrapper.connection.on('subscribe', msg => socket.emit('subscribe', msg));
        tiktokConnectionWrapper.connection.on('liveMember', msg => socket.emit('liveMember', msg));
        tiktokConnectionWrapper.connection.on('competition', msg => socket.emit('competition', msg));   
    });

    socket.on('disconnect', () => {
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Serve frontend files
app.use(express.static('public'));

// Start http listener
const port = process.env.PORT || 8081;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);