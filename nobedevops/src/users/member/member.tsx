// import React, { useState, useEffect } from 'react';

// interface Member {
//     id: string;
//     name: string;
//     email: string;
//     role: string;
//     joinDate: string;
// }

// export const Member: React.FC = () => {
//     const [members, setMembers] = useState<Member[]>([]);
//     const [loading, setLoading] = useState(true);

//     useEffect(() => {
//         // Fetch members from your API
//         const fetchMembers = async () => {
//             try {
//                 // Replace with your actual API endpoint
//                 const response = await fetch('/api/members');
//                 const data = await response.json();
//                 setMembers(data);
//             } catch (error) {
//                 console.error('Error fetching members:', error);
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchMembers();
//     }, []);

//     if (loading) return <div>Loading...</div>;

//     return (
//         <div className="members-container">
//             <h1>Team Members</h1>
//             <div className="members-list">
//                 {members.map((member) => (
//                     <div key={member.id} className="member-card">
//                         <h3>{member.name}</h3>
//                         <p>Email: {member.email}</p>
//                         <p>Role: {member.role}</p>
//                         <p>Joined: {member.joinDate}</p>
//                     </div>
//                 ))}
//             </div>
//         </div>
//     );
// };

// export default Member;