import mongoose from 'mongoose';
import Ticket from '../models/Ticket.js';
import dotenv from 'dotenv';

dotenv.config();

const cleanupPendingAssignments = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find tickets with corrupted pendingAssignment data
    const corruptedTickets = await Ticket.find({
      $or: [
        { 'pendingAssignment.requestedBy': { $exists: false } },
        { 'pendingAssignment.requestedBy': null },
        { 'pendingAssignment.status': { $exists: false } }
      ]
    });

    console.log(`Found ${corruptedTickets.length} tickets with corrupted pendingAssignment data`);

    // Clean up corrupted data
    for (const ticket of corruptedTickets) {
      console.log(`Cleaning up ticket: ${ticket._id}`);
      
      // Remove corrupted pendingAssignment
      ticket.pendingAssignment = undefined;
      await ticket.save();
      
      console.log(`Cleaned up ticket: ${ticket._id}`);
    }

    console.log('Cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
};

cleanupPendingAssignments();
