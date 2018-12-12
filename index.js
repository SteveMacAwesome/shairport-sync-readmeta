const R = require('ramda');
const DEBUG = true;

let statusVars = {
	image: null, // PICT
	title: null, // minm
	album: null, // asal
	artist: null, // asar
	genre: null, // asgn
	composer: null, // ascp
	kind: null, // file kind, asdt
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
	const dataVal = data && (codeVal === 'PICT' ? removeTags(data) : getDataVal(data));

	return {
		type: typeVal,
		code: codeVal,
		data: dataVal,
	};
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

			console.log('\n\n\n');
			console.log(mapped);
			console.log('\n\n\n');

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
					case 'asdt':
						return R.assoc('kind', item.data, acc);
					case 'asgn':
						return R.assoc('genre', item.data, acc);
					default:
						return acc;
				}
			}, {}, mapped);

			// merge with previous status variables
			statusVars = R.merge(statusVars, newStatusVars);

			if (DEBUG) {
				console.log('\n\n\n');
				console.log('statusVars', R.omit(['image'], statusVars));
				console.log('\n\n\n');
			}

			// Send off to any socketIO client that cares to listen
			console.log('emitting...');
			io.emit('update', statusVars);

			// Empty out the buffer
			inputBuffer = Buffer.alloc(0);
		} catch (err) {
			if (DEBUG) {
				console.log(err);
			}
		}
	}
});
