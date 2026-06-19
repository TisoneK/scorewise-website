/**
 * UsersTab — user management tab content.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Shows a table of users with role badges, stats cards, and (for admins)
 * role-change + delete buttons + a "create user" dialog. Also shows
 * a static "Role Permissions" reference card at the bottom.
 */

"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  UserPlus,
  RefreshCw,
  Loader2,
  Shield,
  Eye,
  Users,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { AppUser, UserRole } from "@/lib/types";
import { formatTime } from "@/lib/admin/formatters";

export interface UsersTabProps {
  isAdmin: boolean;
  users: AppUser[];
  loadingUsers: boolean;
  fetchUsers: () => void;
  // Add user dialog state
  addUserOpen: boolean;
  setAddUserOpen: (v: boolean) => void;
  newUserEmail: string;
  setNewUserEmail: (v: string) => void;
  newUserName: string;
  setNewUserName: (v: string) => void;
  newUserPassword: string;
  setNewUserPassword: (v: string) => void;
  newUserRole: UserRole;
  setNewUserRole: (v: UserRole) => void;
  creatingUser: boolean;
  handleCreateUser: () => void;
  // Role change + delete
  changingRole: string | null;
  handleChangeRole: (id: string, newRole: UserRole) => void;
  handleDeleteUser: (id: string, email: string) => void;
}

export function UsersTab({
  isAdmin,
  users,
  loadingUsers,
  fetchUsers,
  addUserOpen,
  setAddUserOpen,
  newUserEmail,
  setNewUserEmail,
  newUserName,
  setNewUserName,
  newUserPassword,
  setNewUserPassword,
  newUserRole,
  setNewUserRole,
  creatingUser,
  handleCreateUser,
  changingRole,
  handleChangeRole,
  handleDeleteUser,
}: UsersTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Manage admin, operator, and user accounts"
              : "View user accounts and activity"}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1.5 bg-neon-green text-background hover:bg-neon-green/90 font-bold"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border/50">
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      placeholder="user@example.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="bg-background border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Name (optional)</Label>
                    <Input
                      placeholder="John Doe"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="bg-background border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="bg-background border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={newUserRole}
                      onValueChange={(v) => setNewUserRole(v as UserRole)}
                    >
                      <SelectTrigger className="bg-background border-border/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USER">User — View predictions only</SelectItem>
                        <SelectItem value="OPERATOR">Operator — Manage users & monitor services</SelectItem>
                        <SelectItem value="ADMIN">Admin — Full control</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancel</Button>
                  </DialogClose>
                  <Button
                    onClick={handleCreateUser}
                    disabled={creatingUser}
                    className="bg-neon-green text-background hover:bg-neon-green/90"
                  >
                    {creatingUser && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Create User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsers}
            disabled={loadingUsers}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card/60 border border-border/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black">{users.length}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
        <div className="bg-card/60 border border-neon-green/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-green">
            {users.filter((u) => u.role === "ADMIN").length}
          </p>
          <p className="text-[10px] text-muted-foreground">Admins</p>
        </div>
        <div className="bg-card/60 border border-neon-yellow/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-yellow">
            {users.filter((u) => u.role === "OPERATOR").length}
          </p>
          <p className="text-[10px] text-muted-foreground">Operators</p>
        </div>
        <div className="bg-card/60 border border-neon-cyan/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-cyan">
            {users.filter((u) => u.role === "USER").length}
          </p>
          <p className="text-[10px] text-muted-foreground">Users</p>
        </div>
      </div>

      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Created</TableHead>
                {isAdmin && <TableHead className="text-xs text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingUsers ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAdmin ? 5 : 4}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className="border-border/20 hover:bg-card/80">
                    <TableCell className="text-sm font-medium">{u.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          u.role === "ADMIN"
                            ? "bg-neon-green/15 text-neon-green border-neon-green/30"
                            : u.role === "OPERATOR"
                              ? "bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30"
                              : "bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30"
                        }
                        variant="outline"
                      >
                        {u.role === "ADMIN" ? (
                          <Shield className="w-3 h-3 mr-1" />
                        ) : u.role === "OPERATOR" ? (
                          <Eye className="w-3 h-3 mr-1" />
                        ) : (
                          <Users className="w-3 h-3 mr-1" />
                        )}
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(u.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && u.role !== "ADMIN" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleChangeRole(
                                    u.id,
                                    u.role === "OPERATOR" ? "ADMIN" : "OPERATOR",
                                  )
                                }
                                disabled={changingRole === u.id}
                                className="text-neon-yellow hover:text-neon-green h-8 w-8"
                              >
                                {changingRole === u.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <ArrowUpRight className="w-4 h-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Promote to {u.role === "OPERATOR" ? "Admin" : "Operator"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {isAdmin && u.role !== "USER" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleChangeRole(
                                    u.id,
                                    u.role === "ADMIN" ? "OPERATOR" : "USER",
                                  )
                                }
                                disabled={changingRole === u.id}
                                className="text-muted-foreground hover:text-neon-red h-8 w-8"
                              >
                                {changingRole === u.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <ArrowDownRight className="w-4 h-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Demote to {u.role === "ADMIN" ? "Operator" : "User"}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="text-muted-foreground hover:text-neon-red h-8 w-8"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table></div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Role Permissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-background/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-neon-green" />
                  <span className="font-bold text-neon-green">Admin</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                  <li>Full dashboard with overview & analytics</li>
                  <li>All predictions (including failed)</li>
                  <li>Charts and data visualizations</li>
                  <li>Service monitoring and controls</li>
                  <li>User management (create/delete)</li>
                  <li>Promote/demote user roles</li>
                  <li>Export predictions data</li>
                  <li className="text-neon-cyan">Service configuration (URLs, API keys)</li>
                  <li className="text-neon-cyan">Activity log and audit trail</li>
                </ul>
              </div>
              <div className="bg-background/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-neon-yellow" />
                  <span className="font-bold text-neon-yellow">Operator</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                  <li>Dashboard overview & analytics</li>
                  <li>Successful predictions</li>
                  <li>Service monitoring (view only)</li>
                  <li>View user accounts</li>
                  <li>Track user activity</li>
                </ul>
              </div>
              <div className="bg-background/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-neon-cyan" />
                  <span className="font-bold text-neon-cyan">User</span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                  <li>Successful predictions only</li>
                  <li>Search and filter predictions</li>
                  <li>Confidence and recommendation filters</li>
                  <li>Auto-refresh every 60 seconds</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
