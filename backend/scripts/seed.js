import mongoose from 'mongoose';
import User from '../models/User.js';
import Article from '../models/Article.js';
import Ticket from '../models/Ticket.js';
import Config from '../models/Config.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load environment setup
import '../env-setup.js';
dotenv.config();

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/resolvia');
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Article.deleteMany({});
    await Ticket.deleteMany({});
    await Config.deleteMany({});
    console.log('Cleared existing data');

    // Hash passwords for demo users
    const saltRounds = 10;
    const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
    const agentPasswordHash = await bcrypt.hash('agent123', saltRounds);
    const userPasswordHash = await bcrypt.hash('user123', saltRounds);
    const janePasswordHash = await bcrypt.hash('password123', saltRounds);

    // Create demo users
    const users = await User.create([
      {
        name: 'Admin User',
        email: 'admin@resolvia.com',
        passwordHash: adminPasswordHash,
        role: 'admin',
        isActive: true
      },
      {
        name: 'Agent Smith',
        email: 'agent@resolvia.com',
        passwordHash: agentPasswordHash,
        role: 'agent',
        isActive: true
      },
      {
        name: 'John Doe',
        email: 'user@resolvia.com',
        passwordHash: userPasswordHash,
        role: 'user',
        isActive: true
      },
      {
        name: 'Jane Customer',
        email: 'jane@customer.com',
        passwordHash: janePasswordHash,
        role: 'user',
        isActive: true
      }
    ]);

    const [admin, agent, user1, user2] = users;
    console.log('Created demo users');

    // Create knowledge base articles
    const articles = await Article.create([
      {
        title: 'How to Reset Your Password',
        body: `If you've forgotten your password, follow these simple steps to reset it:

1. **Go to the Login Page**: Navigate to the login page of our application.

2. **Click "Forgot Password"**: Look for the "Forgot Password" link below the login form.

3. **Enter Your Email**: Provide the email address associated with your account.

4. **Check Your Inbox**: We'll send a password reset link to your email within a few minutes.

5. **Click the Reset Link**: Open the email and click on the password reset link.

6. **Create New Password**: Enter your new password (must be at least 6 characters long).

7. **Confirm Your Password**: Re-enter your new password to confirm.

8. **Login**: Use your new password to log into your account.

**Troubleshooting:**
- If you don't receive the email, check your spam folder
- Make sure you're using the correct email address
- Contact support if you continue having issues

**Security Tips:**
- Use a strong, unique password
- Don't share your password with others
- Consider using a password manager`,
        tags: ['password', 'reset', 'login', 'security', 'troubleshooting'],
        category: 'tech',
        status: 'published',
        createdBy: admin._id,
        viewCount: 45,
        helpfulCount: 12
      },
      {
        title: 'Understanding Your Monthly Invoice',
        body: `Your monthly invoice contains important information about your subscription and usage. Here's what each section means:

**Invoice Header:**
- Invoice number and date
- Billing period covered
- Your account information

**Subscription Details:**
- Plan name and features included
- Monthly or annual billing cycle
- Prorated charges (if applicable)

**Usage Charges:**
- Additional features used beyond your plan
- Overage fees for storage or bandwidth
- Add-on services

**Payment Information:**
- Payment method used
- Transaction date and status
- Next billing date

**Common Questions:**

**Q: Why was I charged a different amount?**
A: This could be due to plan changes, prorated billing, or additional usage charges.

**Q: How can I download my invoice?**
A: Log into your account and go to the Billing section to download PDF copies.

**Q: Can I change my billing date?**
A: Contact our billing team to discuss changing your billing cycle.

**Need Help?**
If you have questions about your invoice, contact our billing team at billing@resolvia.com or submit a support ticket.`,
        tags: ['billing', 'invoice', 'payment', 'subscription', 'charges'],
        category: 'billing',
        status: 'published',
        createdBy: admin._id,
        viewCount: 89,
        helpfulCount: 23
      },
      {
        title: 'Tracking Your Order and Delivery Information',
        body: `Once your order is processed, you'll receive tracking information to monitor your shipment's progress.

**Getting Your Tracking Number:**
1. Check your order confirmation email
2. Log into your account and view order history
3. Look for the tracking number in your order details

**How to Track Your Package:**
1. Visit our shipping partner's website
2. Enter your tracking number
3. View real-time updates on your package location

**Delivery Timeframes:**
- **Standard Shipping**: 5-7 business days
- **Express Shipping**: 2-3 business days
- **Overnight Shipping**: 1 business day
- **International**: 7-14 business days

**Delivery Instructions:**
- Packages require signature confirmation for orders over $100
- We deliver Monday-Friday, 9 AM - 6 PM
- Safe delivery options available if you're not home

**What if My Package is Delayed?**
- Weather conditions may cause delays
- Peak seasons (holidays) may extend delivery times
- Contact us if your package is more than 2 days late

**Delivery Issues:**
- **Package not delivered**: Check with neighbors or building management
- **Damaged package**: Take photos and contact us immediately
- **Wrong address**: Contact us within 24 hours to redirect

**International Shipping:**
- Additional customs fees may apply
- Some items may be restricted in certain countries
- Delivery times vary by destination

For shipping questions, contact our logistics team or submit a support ticket.`,
        tags: ['shipping', 'delivery', 'tracking', 'orders', 'logistics'],
        category: 'shipping',
        status: 'published',
        createdBy: admin._id,
        viewCount: 67,
        helpfulCount: 18
      },
      {
        title: 'Browser Compatibility and Technical Requirements',
        body: `Our application is designed to work on modern web browsers. Here are the technical requirements and troubleshooting tips:

**Supported Browsers:**
- **Chrome**: Version 90 or newer (recommended)
- **Firefox**: Version 88 or newer
- **Safari**: Version 14 or newer
- **Edge**: Version 90 or newer

**System Requirements:**
- **RAM**: Minimum 4GB recommended
- **Internet**: Stable broadband connection
- **JavaScript**: Must be enabled
- **Cookies**: Must be enabled for login functionality

**Mobile Compatibility:**
- iOS Safari: Version 14+
- Chrome Mobile: Latest version
- Samsung Internet: Latest version
- Firefox Mobile: Latest version

**Common Technical Issues:**

**1. Login Problems:**
- Clear browser cache and cookies
- Disable browser extensions temporarily
- Try incognito/private browsing mode

**2. Slow Performance:**
- Close unnecessary browser tabs
- Clear browser cache
- Check internet connection speed
- Disable heavy browser extensions

**3. Display Issues:**
- Ensure browser zoom is set to 100%
- Update your browser to the latest version
- Try a different browser

**4. Feature Not Working:**
- Refresh the page (Ctrl+F5 or Cmd+Shift+R)
- Check if JavaScript is enabled
- Temporarily disable ad blockers

**Browser Settings:**
- Enable JavaScript
- Allow cookies from our domain
- Disable ad blockers for our site
- Keep your browser updated

**Still Having Issues?**
If these steps don't resolve your problem, please contact our technical support team with:
- Your browser and version
- Operating system
- Description of the issue
- Screenshots if possible`,
        tags: ['browser', 'technical', 'compatibility', 'troubleshooting', 'requirements'],
        category: 'tech',
        status: 'published',
        createdBy: admin._id,
        viewCount: 34,
        helpfulCount: 8
      },
      {
        title: 'Account Security Best Practices',
        body: `Protecting your account is our shared responsibility. Follow these security best practices to keep your account safe:

**Strong Password Guidelines:**
- Use at least 8 characters (12+ recommended)
- Include uppercase and lowercase letters
- Add numbers and special characters
- Avoid personal information (birthdate, name, etc.)
- Don't reuse passwords from other accounts

**Two-Factor Authentication (Coming Soon):**
- Additional security layer beyond passwords
- Uses your phone or authenticator app
- Significantly reduces unauthorized access risk

**Safe Login Practices:**
- Always log out when using shared computers
- Don't save passwords on public computers
- Be cautious of public Wi-Fi networks
- Look for HTTPS (secure connection) in the address bar

**Recognizing Phishing Attempts:**
- We'll never ask for passwords via email
- Verify sender email addresses carefully
- Don't click suspicious links
- When in doubt, log in directly to our site

**Account Monitoring:**
- Review your account activity regularly
- Report suspicious activity immediately
- Keep your contact information updated
- Monitor email notifications from us

**What to Do if Compromised:**
1. Change your password immediately
2. Contact our security team
3. Review recent account activity
4. Consider changing passwords on other accounts

**Browser Security:**
- Keep your browser updated
- Use reputable antivirus software
- Be careful with browser extensions
- Clear sensitive data after public computer use

**Mobile Security:**
- Use device lock screens
- Keep apps updated
- Be cautious with app permissions
- Use official app stores only

Remember: We'll never ask for sensitive information via email or phone. When in doubt, contact us directly through official channels.`,
        tags: ['security', 'password', 'account', 'phishing', 'safety'],
        category: 'tech',
        status: 'published',
        createdBy: admin._id,
        viewCount: 56,
        helpfulCount: 15
      },
      {
        title: 'Refund and Return Policy',
        body: `We want you to be completely satisfied with your purchase. Our refund and return policy is designed to be fair and straightforward.

**Refund Eligibility:**
- **Digital Products**: 14-day money-back guarantee
- **Subscription Services**: Prorated refunds for unused time
- **Physical Products**: 30-day return window
- **Custom Orders**: Case-by-case basis

**How to Request a Refund:**
1. **Submit a Request**: Contact our billing team or submit a support ticket
2. **Provide Information**: Include order number and reason for refund
3. **Review Process**: We'll review your request within 2 business days
4. **Approval**: Approved refunds are processed within 5-7 business days

**Refund Methods:**
- **Credit Card**: Refunded to original payment method
- **PayPal**: Refunded to PayPal account
- **Bank Transfer**: For large amounts (processed separately)
- **Store Credit**: Available as an alternative option

**Return Process for Physical Items:**
1. **Get Authorization**: Contact us for a return authorization number
2. **Package Items**: Use original packaging when possible
3. **Ship Back**: Use provided return label
4. **Inspection**: We'll inspect items upon receipt
5. **Refund**: Processed once inspection is complete

**Non-Refundable Items:**
- Downloaded digital content (after 14 days)
- Personalized or custom products
- Gift cards or promotional credits
- Items damaged by misuse

**Subscription Cancellations:**
- Cancel anytime before next billing cycle
- No cancellation fees
- Prorated refunds for mid-cycle cancellations
- Data export available before account closure

**Processing Times:**
- **Review**: 1-2 business days
- **Approval**: Same day notification
- **Credit Card Refunds**: 3-5 business days
- **Bank Transfers**: 5-10 business days

**Partial Refunds:**
Sometimes we may offer partial refunds for:
- Partial service usage
- Damaged items with remaining value
- Goodwill gestures for service issues

**Questions?**
Contact our billing team at billing@resolvia.com for specific questions about your refund or return.`,
        tags: ['refund', 'return', 'billing', 'policy', 'money-back'],
        category: 'billing',
        status: 'published',
        createdBy: admin._id,
        viewCount: 78,
        helpfulCount: 21
      }
    ]);

    console.log('Created knowledge base articles');

    // Create sample tickets
    const tickets = await Ticket.create([
      {
        title: 'Unable to reset password - email not received',
        description: 'I tried to reset my password but I never received the reset email. I checked my spam folder and it\'s not there either. Can you please help me reset my password?',
        category: 'tech',
        status: 'open',
        priority: 'medium',
        createdBy: user1._id
      },
      {
        title: 'Question about invoice charges',
        description: 'I noticed an additional charge on my latest invoice that I don\'t understand. It shows a $15 overage fee but I don\'t think I used any additional services. Can you explain what this charge is for?',
        category: 'billing',
        status: 'triaged',
        priority: 'medium',
        createdBy: user2._id,
        assignee: agent._id
      },
      {
        title: 'Package delivery delayed',
        description: 'My order #12345 was supposed to arrive yesterday but it still shows "In Transit" on the tracking page. I need this package urgently for a presentation. When will it arrive?',
        category: 'shipping',
        status: 'in_progress',
        priority: 'high',
        createdBy: user1._id,
        assignee: agent._id,
        replies: [
          {
            author: agent._id,
            content: 'Hi John, I\'ve checked with our shipping partner and your package experienced a delay due to weather conditions. It should arrive by tomorrow morning. I\'ll monitor the tracking and update you if anything changes.',
            isInternal: false,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
          }
        ]
      },
      {
        title: 'Browser crashes when uploading files',
        description: 'Every time I try to upload a file larger than 5MB, my browser crashes. I\'m using Chrome version 120. This is preventing me from completing my work.',
        category: 'tech',
        status: 'resolved',
        priority: 'high',
        createdBy: user2._id,
        assignee: agent._id,
        resolvedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        replies: [
          {
            author: agent._id,
            content: 'This seems to be related to a known Chrome issue with large file uploads. Please try using Firefox or Safari for uploading large files, or try uploading smaller chunks.',
            isInternal: false,
            createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
          },
          {
            author: user2._id,
            content: 'Thanks! Using Firefox worked perfectly. The upload completed without any issues.',
            isInternal: false,
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
          }
        ]
      },
      {
        title: 'General inquiry about features',
        description: 'I\'m interested in learning more about the advanced features available in the premium plan. Could someone provide more details about what\'s included?',
        category: 'other',
        status: 'waiting_human',
        priority: 'low',
        createdBy: user1._id
      }
    ]);

    console.log('Created sample tickets');

    // Create default configuration
    await Config.create({
      _id: 'config',
      autoCloseEnabled: false,
      confidenceThreshold: 0.8,
      slaHours: 24,
      stubMode: true,
      emailNotificationsEnabled: true,
      autoAssignmentEnabled: false,
      maxTicketsPerAgent: 10
    });

    console.log('Created default configuration');

    console.log('\n✅ Seed data created successfully!');
    console.log('\n📧 Demo Accounts:');
    console.log('Admin: admin@resolvia.com / admin123');
    console.log('Agent: agent@resolvia.com / agent123');
    console.log('User:  user@resolvia.com / user123');
    console.log('\n🎯 You can now start the application and login with these accounts.');

  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

seedData();
