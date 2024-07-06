let userName = prompt("Kullanıcı adınızı girin:");
const password = "x";


const saveUsername = async (userName) => {
    try {
        const response = await fetch('/save-username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userName }),
        });
        const result = await response.json();
        if (result.success) {
            console.log('Kullanıcı adı başarıyla kaydedildi.');
        } else {
            console.error('Kullanıcı adı kaydedilirken bir hata oluştu:', result.error);
        }
    } catch (error) {
        console.error('Kullanıcı adı kaydedilirken bir hata oluştu:', error);
    }
};

saveUsername(userName);

document.querySelector('#user-name').innerHTML = `<span style="color: blue;font-weight: bold;background-color: lightgrey;padding: 5px; border-radius: 3px;">${userName}</span>`;

const socket = io.connect('https://192.168.249.221:8181/', {
    auth: {
        userName,
        password
    }
});

const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

let localStream; 
let remoteStream; 
let peerConnection; 
let didIOffer = false;

let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
};

const call = async e => {
    await fetchUserMedia();
    await createPeerConnection();

    try {
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log(offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer', offer); 
    } catch (err) {
        console.log(err);
    }
};

const answerOffer = async offerObj => {
    await fetchUserMedia();
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); 
    await peerConnection.setLocalDescription(answer); 
    console.log(offerObj);
    console.log(answer);
    offerObj.answer = answer;
    const offerIceCandidates = await socket.emitWithAck('newAnswer', offerObj);
    offerIceCandidates.forEach(c => {
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======");
    });
    console.log(offerIceCandidates);
};

const addAnswer = async offerObj => {
    await peerConnection.setRemoteDescription(offerObj.answer);
};

const fetchUserMedia = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
            });
            localVideoEl.srcObject = stream;
            localStream = stream;
            resolve();
        } catch (err) {
            console.log(err);
            reject();
        }
    });
};

const createPeerConnection = offerObj => {
    return new Promise(async (resolve, reject) => {
        peerConnection = await new RTCPeerConnection(peerConfiguration);
        remoteStream = new MediaStream();
        remoteVideoEl.srcObject = remoteStream;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState);
        });

        peerConnection.addEventListener('icecandidate', e => {
            console.log('........Ice candidate found!......');
            console.log(e);
            if (e.candidate) {
                socket.emit('sendIceCandidateToSignalingServer', {
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                });
            }
        });

        peerConnection.addEventListener('track', e => {
            console.log("Got a track from the other peer!! How excting");
            console.log(e);
            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
                console.log("Here's an exciting moment... fingers cross");
            });
        });

        if (offerObj) {
            await peerConnection.setRemoteDescription(offerObj.offer);
        }
        resolve();
    });
};

const addNewIceCandidate = iceCandidate => {
    peerConnection.addIceCandidate(iceCandidate);
    console.log("======Added Ice Candidate======");
};

document.querySelector('#call').addEventListener('click', call);
const hangupCall = async () => {
    try {
        if (peerConnection) {
            peerConnection.close();
            console.log('Peer Connection closed.');
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localVideoEl.srcObject = null;
            localStream = null;
            console.log('Local stream stopped.');
        }
        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            remoteVideoEl.srcObject = null;
            remoteStream = null;
            console.log('Remote stream stopped.');
        }
        document.querySelector('#waiting').style.display = 'block';
    } catch (err) {
        console.error('Error hanging up:', err);
    }
};

document.querySelector('#hangup').addEventListener('click', hangupCall);
socket.on('newMessage', (message) => {
    io.emit('receivedMessage', { userName: socket.handshake.auth.userName, message });
});

const messageForm = document.querySelector('#message-form');
const messageInput = document.querySelector('#message-input');
const messageList = document.querySelector('#message-list');

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message !== '') {
        socket.emit('newMessage', message);
        messageInput.value = '';
    }
});

socket.on('receivedMessage', ({ userName, message }) => {
    addReceivedMessage(userName, message); 

});


const addReceivedMessage = (userName, message) => {
    const messageItem = document.createElement('li');
    messageItem.classList.add('received-message');
    const userNameSpan = document.createElement('span');
    userNameSpan.style.color = 'blue'; 
    userNameSpan.textContent = userName; 
    messageItem.appendChild(userNameSpan); 
    messageItem.innerHTML += `: ${message}`; 
    messageList.appendChild(messageItem); 
};