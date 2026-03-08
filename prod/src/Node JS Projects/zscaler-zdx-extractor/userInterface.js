const readline = require('readline');
const logger = require('./logger');

class UserInterface {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async showMenu() {
        console.log('\n=== Zscaler ZDX Battery Data Extractor ===');
        console.log('Select a time period for data extraction:');
        console.log('1. Last 2 hours');
        console.log('2. Last 12 hours');
        console.log('3. Last 24 hours');
        console.log('4. Specific day (midnight to midnight)');
        console.log('5. Exit');
        console.log('==========================================');
        
        return new Promise((resolve) => {
            this.rl.question('Enter your choice (1-5): ', (answer) => {
                resolve(answer.trim());
            });
        });
    }

    async getSpecificDate() {
        console.log('\nEnter the specific date for extraction:');
        
        return new Promise((resolve) => {
            this.rl.question('Date (YYYY-MM-DD format, e.g., 2025-05-27): ', (answer) => {
                resolve(answer.trim());
            });
        });
    }

    close() {
        this.rl.close();
    }

    async waitForUserInput() {
        return new Promise((resolve) => {
            this.rl.question('\nPress Enter to continue...', () => {
                resolve();
            });
        });
    }
}

module.exports = UserInterface;
