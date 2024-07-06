const fs = require('fs');
const https = require('https');
const express = require('express');
const mongoose = require('mongoose');
const socketio = require('socket.io');
const app = express();

app.use(express.static(__dirname));
app.use(express.json()); // JSON parse için gerekli middleware

// SSL sertifikaları
const key = fs.readFileSync('cert.key');
const cert = fs.readFileSync('cert.crt');

// Express sunucusu ve Socket.IO kurulumu
const expressServer = https.createServer({ key, cert }, app);
const io = socketio(expressServer, {
    cors: {
        origin: [
            "https://localhost",
        ],
        methods: ["GET", "POST"]
    }
});

expressServer.listen(8181, () => {
    console.log('Sunucu 8181 portunda çalışıyor');
});


const uri = "mongodb+srv://ruken:rukennn43@cluster0.idjrqv5.mongodb.net/Chat-app?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, 
    socketTimeoutMS: 45000 
}).then(() => {
    console.log("MongoDB'ye başarıyla bağlanıldı!");
}).catch((error) => {
    console.error("MongoDB bağlantısı başarısız oldu:", error);
    process.exit(1); 
});


const userSchema = new mongoose.Schema({
    userName: { type: String, required: true, unique: true },
    socketId: { type: String, required: true },
    connectedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const offers = [];
const connectedSockets = [];

io.on('connection', (socket) => {
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if (password !== "x") {
        socket.disconnect(true);
        return;
    }

    connectedSockets.push({
        socketId: socket.id,
        userName
    });

    if (offers.length) {
        socket.emit('availableOffers', offers);
    }

  
    User.findOne({ userName }).then(existingUser => {
        if (!existingUser) {
            const user = new User({
                socketId: socket.id,
                userName: userName
            });
            user.save().then(() => {
                console.log('Kullanıcı veritabanına kaydedildi.');
            }).catch((error) => {
                console.error('Kullanıcı veritabanına kaydedilemedi:', error);
            });
        } else {
            console.log('Kullanıcı adı zaten mevcut, yeni kayıt eklenmedi.');
        }
    }).catch((error) => {
        console.error('Kullanıcı kontrolü sırasında hata oluştu:', error);
    });

    socket.on('newOffer', newOffer => {
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answererIceCandidates: []
        });
        socket.broadcast.emit('newOfferAwaiting', offers.slice(-1));
    });

    socket.on('newAnswer', (offerObj, ackFunction) => {
        console.log(offerObj);
        const socketToAnswer = connectedSockets.find(s => s.userName === offerObj.offererUserName);
        if (!socketToAnswer) {
            console.log("No matching socket");
            return;
        }
        const socketIdToAnswer = socketToAnswer.socketId;
        const offerToUpdate = offers.find(o => o.offererUserName === offerObj.offererUserName);
        if (!offerToUpdate) {
            console.log("No OfferToUpdate");
            return;
        }
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer;
        offerToUpdate.answererUserName = userName;
        socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate);
    });

    socket.on('sendIceCandidateToSignalingServer', iceCandidateObj => {
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        if (didIOffer) {
            const offerInOffers = offers.find(o => o.offererUserName === iceUserName);
            if (offerInOffers) {
                offerInOffers.offerIceCandidates.push(iceCandidate);
                if (offerInOffers.answererUserName) {
                    const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.answererUserName);
                    if (socketToSendTo) {
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate);
                    } else {
                        console.log("Ice candidate received but could not find answerer");
                    }
                }
            } else {
                console.log("Offer not found for the given offererUserName:", iceUserName);
            }
        } else {
            const offerInOffers = offers.find(o => o.answererUserName === iceUserName);
            if (offerInOffers) {
                const socketToSendTo = connectedSockets.find(s => s.userName === offerInOffers.offererUserName);
                if (socketToSendTo) {
                    socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate);
                } else {
                    console.log("Ice candidate received but could not find offerer");
                }
            } else {
                console.log("Offer not found for the given answererUserName:", iceUserName);
            }
        }
    });

    socket.on('newMessage', (message) => {
        io.emit('receivedMessage', { userName: socket.handshake.auth.userName, message });
    });

    socket.on('disconnect', () => {
        const index = connectedSockets.findIndex(s => s.socketId === socket.id);
        if (index !== -1) {
            connectedSockets.splice(index, 1);
        }

        User.deleteOne({ socketId: socket.id }).then(() => {
            console.log('Kullanıcı veritabanından silindi.');
        }).catch((error) => {
            console.error('Kullanıcı veritabanından silinemedi:', error);
        });

        console.log('Bir kullanıcı ayrıldı.');
    });
});

app.post('/save-username', async (req, res) => {
    try {
        const { userName } = req.body;
        const existingUser = await User.findOne({ userName });
        if (existingUser) {
            return res.json({ success: false, error: 'Kullanıcı adı zaten mevcut' });
        }

        const user = new User({
            userName,
            socketId: '', 
            connectedAt: new Date()
        });
        await user.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Kullanıcı adı kaydedilirken bir hata oluştu:', error);
        res.json({ success: false, error: 'Kullanıcı adı kaydedilirken bir hata oluştu' });
    }
});
