const R = require('ramda');
const DEBUG = false;

let statusVars = {
	id: null, // mper, should be unique id of track
	image: null, // PICT
	title: null, // minm
	album: null, // asal
	artist: null, // asar
	genre: null, // asgn
	composer: null, // ascp
	playing: false, //pbeg, pend
	volume: null, //pvol
	device: null, //pnam
	progress: null // prgr
};

// Set up express server that will push socketIO messages to the client
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

io.on('connection', function (socket) {
	console.log('a user connected');
	socket.emit('update', statusVars);
});

http.listen(3000, function () {
	console.log('listening on *:3000');
});

// Now that that's done, let's start listening to the stdin stream and push socket messages when needed
let inputBuffer = Buffer.alloc(0);


const processLine = line => {
	const codeRegex = /(<code>)(.+)(<\/code>)/g;
	const typeRegex = /(<type>)(.+)(<\/type>)/g;
	const dataRegex = /(<data encoding="base64">)(.+)(<\/data>)/g;

	const removeTags = R.compose(
		R.replace(/<\/?[A-Za-z="0-9 ]+>/g, ''),
		R.head,
	)

	const getDataVal = R.compose(
		x => Buffer.from(x, 'base64').toString('utf8'),
		removeTags,
	);

	const getEncVal = R.compose(
		x => Buffer.from(x, 'hex').toString('utf8'),
		removeTags,
	);

	const type = line.match(typeRegex);
	const code = line.match(codeRegex);
	const data = line.match(dataRegex);

	const typeVal = type && getEncVal(type);
	const codeVal = code && getEncVal(code);
	const dataVal = data && ((codeVal === 'PICT' || codeVal === 'mper') ? removeTags(data) : getDataVal(data));

	return {
		type: typeVal,
		code: codeVal,
		data: dataVal,
	};
}

const processVolume = volume => {
	const dBvol = R.head(volume.split(','));
	const linearVol = Math.max(0, ((10 / 3) * dBvol) + 100);

	return Math.round(linearVol);
}

const getDuration = length => `${Math.floor(length / 60)}:${Math.round(length % 60).toString().padStart(2, 0)}`;

const processProgress = progress => {
	const [start, now, end] = progress.split('/');

	const length = (end - start) / 44100;
	const position = (now - start) / 44100;


	const duration = getDuration(length);
	const startPos = getDuration(position);

	if (DEBUG) {
		console.log(`length:`, length);
		console.log(`position:`, position);
		console.log(`duration:`, duration)
	}
	return {
		duration,
		position: Math.round(position)
	}
}


console.log('Opening stdin stream...');
process.stdin.on('readable', async () => {
	const chunk = process.stdin.read();
	if (DEBUG) {
		console.log('reading stdin...');
	}

	if (chunk == null) {
		console.log('Null chunk!');
	}

	if (chunk !== null) {
		let newInputbuffer = Buffer.alloc(inputBuffer.length + chunk.length);
		inputBuffer.copy(newInputbuffer);
		chunk.copy(newInputbuffer, inputBuffer.length);

		inputBuffer = newInputbuffer;
		if (DEBUG) {
			console.log(`Input buffer is now ${inputBuffer.length} bytes long...`);
		}

		try {
			const inputString = inputBuffer.toString().replace(/\n/gm, '');
			const inputItems = inputString.replace(/<\/item>/gm, '</item>:!:').split(':!:');
			const cleanedItems = R.without('', inputItems);

			if (!R.last(cleanedItems).endsWith('</item>')) {
				// Must not be done yet, wait for more data
				return;
			}

			const mapped = R.map(processLine, inputItems);

			if (DEBUG) {
				console.log('\n\n');
				console.log(mapped);
				console.log('\n\n');
			}

			// Iterate over mapped and set status vars accordingly
			const newStatusVars = R.reduce((acc, item) => {
				switch (item.code) {
					case 'PICT':
						return R.assoc('image', item.data, acc);
					case 'minm':
						return R.assoc('title', item.data, acc);
					case 'asal':
						return R.assoc('album', item.data, acc);
					case 'asar':
						return R.assoc('artist', item.data, acc);
					case 'ascp':
						return R.assoc('composer', item.data, acc);
					case 'asgn':
						return R.assoc('genre', item.data, acc);
					case 'pbeg':
						return R.assoc('playing', true, acc);
					case 'pend':
						return R.assoc('playing', false, acc);
					case 'pvol':
						return R.assoc('volume', processVolume(item.data), acc);
					case 'pnam':
						return R.assoc('device', item.data, acc);
					case 'prgr':
						return R.assoc('progress', processProgress(item.data), acc);
					case 'mper':
						return R.assoc('id', item.data, acc);
					default:
						return acc;
				}
			}, {}, mapped);

			// merge with previous status variables
			statusVars = R.merge(statusVars, newStatusVars);

			if (DEBUG) {
				console.log('\n\n\n');
				console.log('statusVars', R.omit(['image'], statusVars));
				console.log('image :', Boolean(statusVars.image));
				console.log('\n\n\n');
			}

			// Send off to any socketIO client that cares to listen
			if (statusVars.end) {
				if (DEBUG) {
					console.log('emitting...');
				}

				io.emit('update', {
					image: null,
					kind: null,
					album: null,
					artist: null,
					title: null,
					genre: null,
					composer: null,
				});
			} else {
				io.emit('update', statusVars);
			}

			// Empty out the buffer
			inputBuffer = Buffer.alloc(0);
		} catch (err) {
			if (DEBUG) {
				console.log(err);
			}
		}
	}
});
