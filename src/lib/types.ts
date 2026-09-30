export type UserRole = 'admin' | 'employee';

export type UserProfile = {
  uid: string;
  fullName: string;
  email: string;
  employeeId: string;
  role: UserRole;
  createdAt?: { seconds: number } | null;
};

export const isAdmin = (user: UserProfile | null): boolean => user?.role === 'admin';
