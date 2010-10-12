var curPostNum = 0;
var activePosts = {};
var threads = {};

function make_reply_box() {
	var box = $('<li class="replylink"><a>[Reply]</a></li>');
	box.find('a').click(new_post_form);
	return box;
}

function insert_new_post_boxes() {
	make_reply_box().appendTo('ul:not(.newlink)');
	var box = $('<ul class="newlink"><li><a>[New thread]</a></li></ul>');
	box.find('a').click(new_post_form);
	$('hr').after(box);
}

function insert_formatted(text, buffer, state) {
	format_fragment(text, state, function (frag) {
		var dest = buffer;
		for (var i = 0; i < state[1]; i++)
			dest = dest.children('del:last');
		if (state[0] == 1)
			dest = dest.children('em:last');
		if (frag.safe == '<del>')
			dest.append(document.createElement('del'));
		else if (frag.safe == '<em>')
			dest.append(document.createElement('em'));
		else if (frag.safe != '</del>' && frag.safe != '</em>')
			dest.append(escape_fragment(frag));
	});
}

function insert_post(msg) {
	var post = $(gen_post_html(msg));
	activePosts[msg.num] = post;
	if (msg.op) {
		threads[msg.op].find('li:not(.replylink):last').after(post);
	}
	else {
		var new_ul = $('<ul id="thread'+msg.num+'"/>').append(post);
		threads[msg.num] = new_ul;
		if (!curPostNum)
			new_ul.append(make_reply_box());
		var newlink = $('.newlink');
		new_ul.insertAfter(newlink.length ? newlink : 'hr');
	}
}

function update_post(msg) {
	var num = msg[0], frag = msg[1], state = [msg[2], msg[3]];
	var post = activePosts[num];
	insert_formatted(frag, post.find('blockquote'), state);
}

function finish_post(num) {
	activePosts[num].removeClass('editing');
	delete activePosts[num];
}

function extract_num(q, prefix) {
	return parseInt(q.attr('id').replace(prefix, ''));
}

function new_post_form() {
	var buffer = $('<p/>'), line_buffer = $('<p/>');
	var meta = $('<span><b/> <code/> <time/></span>');
	var posterName = $('input[name=name]').val().trim();
	var posterEmail = $('input[name=email]').val().trim();
	var input = $('<input name="body" class="trans"/>');
	var blockquote = $('<blockquote/>');
	var post = $('<li/>');
	var postOp = null;
	var dummy = $(document.createTextNode(' '));
	var sentAllocRequest = false;
	var ul = $(this).parents('ul');
	var state = initial_post_state();
	var INPUT_MIN_SIZE = 2;

	blockquote.append.apply(blockquote, [buffer, line_buffer, input]);
	post.append.apply(post, [meta, blockquote]);

	var parsed = parse_name(posterName);
	meta.children('b').text(parsed[0]);
	meta.children('code').text(parsed[1] && '!?');
	if (posterEmail) {
		/* TODO: add link */
	}

	if (ul.hasClass('newlink'))
		ul.removeClass('newlink');
	else
		postOp = extract_num(ul, 'thread');

	allocate_post = function (msg) {
		var num = msg.num;
		meta.children('b').text(msg.name);
		meta.children('code').text(msg.trip);
		meta.children('time').text(time_to_str(msg.time));
		curPostNum = num;
		meta.append(' No.<a href="#q' + num + '">' + num + '</a>');
		post.attr('id', 'q' + num).addClass('editing');
		if (!postOp) {
			ul.attr('id', 'thread' + num);
			threads[num] = ul;
		}

		var submit = $('<input type="button" value="Done"/>')
		post.append(submit)
		submit.click(function () {
			/* transform into normal post */
			commit(input.val());
			input.remove();
			submit.remove();
			insert_formatted(line_buffer.text(), buffer, state);
			buffer.replaceWith(buffer.contents());
			line_buffer.remove();
			post.removeClass('editing');

			curPostNum = 0;
			send(socket, [FINISH_POST]);
			insert_new_post_boxes();
		});
	}
	function commit(text) {
		if (!text)
			return;
		if (!curPostNum && !sentAllocRequest) {
			var msg = {
				name: posterName,
				email: posterEmail,
				frag: text
			};
			if (postOp)
				msg.op = postOp;
			send(socket, [ALLOCATE_POST, msg]);
			sentAllocRequest = true;
		}
		else if (curPostNum) {
			/* TODO: Maybe buffer until allocation okayed? */
			send(socket, text);
		}
		if (text.indexOf('\n') >= 0) {
			var lines = text.split('\n');
			lines[0] = line_buffer.text() + lines[0];
			line_buffer.text(lines.pop());
			for (var i = 0; i < lines.length; i++)
				insert_formatted(lines[i]+'\n', buffer, state);
		}
		else {
			line_buffer.append(document.createTextNode(text));
		}
	}
	function commit_words(text, spaceEntered) {
		var words = text.trim().split(/ +/);
		var endsWithSpace = text.length > 0
				&& text.charAt(text.length-1) == ' ';
		var newWord = endsWithSpace && !spaceEntered;
		if (newWord && words.length > 1) {
			input.val(words.pop() + ' ');
			commit(words.join(' ') + ' ');
		}
		else if (words.length > 2) {
			var last = words.pop();
			input.val(words.pop() + ' ' + last
					+ (endsWithSpace ? ' ' : ''));
			commit(words.join(' ') + ' ');
		}
	}
	input.attr('size', INPUT_MIN_SIZE);
	input.keydown(function (event) {
		var key = event.keyCode;
		if (key == 13) {
			if (sentAllocRequest || input.val().replace(' ', '')) {
				commit(input.val() + '\n');
				input.val('');
			}
			event.preventDefault();
		}
		else {
			commit_words(input.val(), key == 27);
		}
		var cur_size = input.attr('size');
		var right_size = Math.max(Math.round(input.val().length * 1.5),
				INPUT_MIN_SIZE);
		if (cur_size != right_size) {
			input.attr('size', (cur_size + right_size) / 2);
		}
	});
	/* do the switch */
	$(this).parent().replaceWith(dummy);
	$('.newlink, .replylink').remove();
	dummy.replaceWith(post);
	input.focus();
}

var socket = new io.Socket('localhost', {
	port: 8000,
	transports: ['websocket', 'htmlfile', 'xhr-multipart', 'xhr-polling',
		'jsonp-polling']
});
var allocate_post = function (msg) {};

$(document).ready(function () {
	$('.editing').each(function(index) {
		var post = $(this);
		activePosts[extract_num(post, 'q')] = post;
	});
	$('ul').each(function (index) {
		var ul = $(this);
		threads[extract_num(ul, 'thread')] = ul;
	});
	if (window.location.hash) {
		var id = window.location.hash.match(/^(#q\d+)$/);
		if (id) {
			var li = $(id[1]);
			if (li)
				li.addClass('highlight');
		}
	}
	insert_new_post_boxes();

	socket.on('connect', function () {
		console.log('Connected.');
	});
	socket.on('disconnect', function () {
		console.log('Disconnected.');
	});
	socket.on('message', function (msg) {
		console.log(msg);
		msg = JSON.parse(msg);
		var type = msg.shift();
		switch (type) {
		case INVALID: console.log("Something's gone wrong."); break;
		case ALLOCATE_POST: allocate_post(msg[0]); break;
		case INSERT_POST: insert_post(msg[0]); break;
		case UPDATE_POST: update_post(msg); break;
		case FINISH_POST: finish_post(msg[0]); break;
		}
	});
	socket.connect();
});
