import { storage } from '../server/storage.js';

async function createAdminUser() {
  
  try {
    // Create admin user for organization 'mfw'
    const adminUser = await storage.createUser({
      organizationId: 'mfw',
      loanOfficerId: 'ADMIN',
      password: 'admin123', // Temporary password - should be changed after first login
      name: 'MFW Administrator',
      role: 'admin',
      isAdmin: true,
    });
    
    console.log('✅ Admin user created successfully!');
    console.log('Organization ID:', adminUser.organizationId);
    console.log('Loan Officer ID:', adminUser.loanOfficerId);
    console.log('Name:', adminUser.name);
    console.log('Role:', adminUser.role);
    console.log('Is Admin:', adminUser.isAdmin);
    console.log('\n⚠️  Default password: admin123');
    console.log('Please change this password after first login.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdminUser();
