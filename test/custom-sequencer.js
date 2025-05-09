const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Define the preferred test order
    const testOrder = [
      'app.e2e-spec.ts',    // Run the basic app test first
      'auth.e2e-spec.ts',   // Then auth tests (register, login)
      'file-upload.e2e-spec.ts' // Finally file operations
    ];

    // Sort tests according to the predefined order
    return tests.sort((testA, testB) => {
      const fileNameA = testA.path.split('/').pop();
      const fileNameB = testB.path.split('/').pop();
      
      const indexA = testOrder.indexOf(fileNameA);
      const indexB = testOrder.indexOf(fileNameB);
      
      // If both files are in our order array, sort by their position
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // If only one file is in our order array, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // For files not in our order array, sort alphabetically
      return fileNameA.localeCompare(fileNameB);
    });
  }
}

module.exports = CustomSequencer; 