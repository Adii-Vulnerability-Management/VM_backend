const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Initialize readline interface to get user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to recursively get folder structure and file names without extensions
function getFolderStructure(dirPath) {
  let result = [];

  // Read the directory content
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    // Check if it's a directory
    if (stats.isDirectory()) {
      result.push({
        id: 'uuid()', // Replace with actual UUID if needed
        name: file,
        icon: 'FiFolder', // Assuming folders have a folder icon
        children: getFolderStructure(filePath), // Recurse into subfolder
      });
    } else {
      // If it's a file, add the file name without extension
      result.push({
        id: 'uuid()', // Replace with actual UUID if needed
        name: path.parse(file).name,
        icon: 'FiFile', // Assuming files have a file icon
        link: filePath, // Full path to file (optional)
      });
    }
  });

  return result;
}

// Ask the user for the directory to start scraping
rl.question('Enter the directory path to start scraping: ', (folderPath) => {
  // Ensure the folderPath is valid
  if (!fs.existsSync(folderPath)) {
    console.log(
      'The directory does not exist. Please try again with a valid path.',
    );
    rl.close();
    return;
  }

  // Get folder structure starting from the provided folder path
  const folderStructure = getFolderStructure(folderPath);

  // Output the structure in the desired format
  console.log(JSON.stringify(folderStructure, null, 2));

  // Close the readline interface
  rl.close();
});
