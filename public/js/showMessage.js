function showMessage(message, type){
    const messageBox = document.querySelector('#message');
    messageBox.className = 'message ' + type;
    messageBox.textContent = message;
  }