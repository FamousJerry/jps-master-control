const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

// This serves all files in your folder (like CSS or images in the future)
app.use(express.static(__dirname));

// This specifically handles the main page request
app.get('/', (req, res) => {
  // We explicitly tell the browser this is an HTML file
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
