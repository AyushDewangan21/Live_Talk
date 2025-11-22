"use strict";

var usernamePage = document.querySelector("#username-page");
var chatPage = document.querySelector("#chat-page");
var usernameForm = document.querySelector("#usernameForm");
var messageForm = document.querySelector("#messageForm");
var messageInput = document.querySelector("#message");
var messageArea = document.querySelector("#messageArea");
var connectingElement = document.querySelector(".connecting");
var fileInput = document.querySelector("#fileInput");
var uploadBtn = document.querySelector("#uploadBtn");

var stompClient = null;
var username = null;

var colors = [
  "#2196F3",
  "#32c787",
  "#00BCD4",
  "#ff5652",
  "#ffc107",
  "#ff85af",
  "#FF9800",
  "#39bbb0",
];

function connect(event) {
  username = document.querySelector("#name").value.trim();

  if (username) {
    usernamePage.classList.add("hidden");
    chatPage.classList.remove("hidden");

    var socket = new SockJS("/ws");
    stompClient = Stomp.over(socket);

    stompClient.connect({}, onConnected, onError);
  }
  event.preventDefault();
}

function onConnected() {
  // Subscribe to the Public Topic
  stompClient.subscribe("/topic/public", onMessageReceived);

  // Tell your username to the server
  stompClient.send(
    "/app/chat.addUser",
    {},
    JSON.stringify({ sender: username, type: "JOIN" })
  );

  connectingElement.classList.add("hidden");
}

function onError(error) {
  connectingElement.textContent =
    "Could not connect to WebSocket server. Please refresh this page to try again!";
  connectingElement.style.color = "red";
}

function sendMessage(event) {
  var messageContent = messageInput.value.trim();
  if (messageContent && stompClient) {
    var chatMessage = {
      sender: username,
      content: messageInput.value,
      type: "CHAT",
    };
    stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(chatMessage));
    messageInput.value = "";
  }
  event.preventDefault();
}

function uploadFile(event) {
  var file = fileInput.files[0];
  if (!file) {
    alert("Please choose a file first.");
    return;
  }
  if (!username || !stompClient) {
    alert("Please join the chat before uploading a file.");
    return;
  }
  var formData = new FormData();
  formData.append("file", file);
  formData.append("sender", username);
  // optional caption
  if (messageInput.value && messageInput.value.trim().length > 0) {
    formData.append("content", messageInput.value.trim());
    messageInput.value = "";
  }

  // disable upload button while uploading
  if (uploadBtn) uploadBtn.disabled = true;
  fetch("/chat/upload", {
    method: "POST",
    body: formData,
  })
    .then(function (response) {
      if (!response.ok) {
        return response.text().then(function (t) {
          throw new Error(t);
        });
      }
      return response.json();
    })
    .then(function (data) {
      // server broadcasts the message; clear file input
      fileInput.value = null;
    })
    .catch(function (err) {
      console.error("Upload failed:", err);
      alert("File upload failed: " + err.message);
    })
    .finally(function () {
      if (uploadBtn) uploadBtn.disabled = false;
    });

  event.preventDefault();
}

function onMessageReceived(payload) {
  var message = JSON.parse(payload.body);

  var messageElement = document.createElement("li");

  if (message.type === "JOIN") {
    messageElement.classList.add("event-message");
    message.content = message.sender + " joined!";
  } else if (message.type === "LEAVE") {
    messageElement.classList.add("event-message");
    message.content = message.sender + " left!";
  } else {
    messageElement.classList.add("chat-message");

    var avatarElement = document.createElement("i");
    var avatarText = document.createTextNode(message.sender[0]);
    avatarElement.appendChild(avatarText);
    avatarElement.style["background-color"] = getAvatarColor(message.sender);

    messageElement.appendChild(avatarElement);

    var usernameElement = document.createElement("span");
    var usernameText = document.createTextNode(message.sender);
    usernameElement.appendChild(usernameText);
    messageElement.appendChild(usernameElement);
  }

  var textElement = document.createElement("p");

  // If the message contains a file, render a link or preview
  if (message.type === "FILE" && message.fileUrl) {
    var caption = message.content || "";
    var captionNode = document.createTextNode(caption);
    if (caption.length > 0) {
      textElement.appendChild(captionNode);
    }

    // show file name and link/preview
    var fileWrapper = document.createElement("div");
    var link = document.createElement("a");
    link.href = message.fileUrl;
    link.target = "_blank";
    link.textContent = message.fileName || "download file";

    if (message.fileType && message.fileType.startsWith("image/")) {
      var img = document.createElement("img");
      img.src = message.fileUrl;
      img.style.maxWidth = "200px";
      img.style.display = "block";
      fileWrapper.appendChild(img);
    } else if (message.fileType === "application/pdf") {
      var pdfLink = document.createElement("a");
      pdfLink.href = message.fileUrl;
      pdfLink.target = "_blank";
      pdfLink.textContent = "Open PDF: " + (message.fileName || "file.pdf");
      fileWrapper.appendChild(pdfLink);
    } else {
      fileWrapper.appendChild(link);
    }

    textElement.appendChild(document.createElement("br"));
    textElement.appendChild(fileWrapper);
  } else {
    var messageText = document.createTextNode(message.content);
    textElement.appendChild(messageText);
  }

  messageElement.appendChild(textElement);

  messageArea.appendChild(messageElement);
  messageArea.scrollTop = messageArea.scrollHeight;
}

function getAvatarColor(messageSender) {
  var hash = 0;
  for (var i = 0; i < messageSender.length; i++) {
    hash = 31 * hash + messageSender.charCodeAt(i);
  }
  var index = Math.abs(hash % colors.length);
  return colors[index];
}

usernameForm.addEventListener("submit", connect, true);
messageForm.addEventListener("submit", sendMessage, true);
if (uploadBtn) {
  uploadBtn.addEventListener("click", uploadFile, true);
}
