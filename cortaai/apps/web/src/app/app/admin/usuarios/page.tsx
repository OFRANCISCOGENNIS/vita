"use client";

// Painel do ADM · Usuários — tabela com busca, ordenação, filtros e ações
// (promover/rebaixar, suspender/reativar, ver detalhes). Ações são mock:
// atualização otimista do estado local + toast.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Eye,
  Search,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
} from "lucide-react";
import { adminUsers, type AdminUser } from "@/lib/admin-data";
import { MOCK_NOW } from "@/lib/mock-data";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "name" | "projects" | "cuts" | "lastAccess";
type RoleFilter = "all" | "admin" | "common";
type StatusFilter = "all" | "active" | "suspended";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastAccess");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setUsers(adminUsers.map((u) => ({ ...u }))), 360);
    return () => clearTimeout(t);
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const term = q.trim().toLowerCase();
    const rows = users.filter((u) => {
      if (role !== "all" && u.role !== role) return false;
      if (status !== "all" && u.status !== status) return false;
      if (term && !u.name.toLowerCase().includes(term) && !u.email.toLowerCase().includes(term)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "pt-BR") * dir;
      if (sortKey === "projects") return (a.projects - b.projects) * dir;
      if (sortKey === "cuts") return (a.cuts - b.cuts) * dir;
      return (new Date(a.lastAccess).getTime() - new Date(b.lastAccess).getTime()) * dir;
    });
  }, [users, q, role, status, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function patch(id: string, fn: (u: AdminUser) => AdminUser) {
    setUsers((prev) => (prev ? prev.map((u) => (u.id === id ? fn(u) : u)) : prev));
    setDetail((d) => (d && d.id === id ? fn(d) : d));
  }

  function toggleRole(u: AdminUser) {
    const next = u.role === "admin" ? "common" : "admin";
    patch(u.id, (x) => ({ ...x, role: next }));
    toast(next === "admin" ? "Usuário promovido a admin" : "Admin rebaixado a comum", {
      description: `${u.name} agora é ${next === "admin" ? "administrador" : "usuário comum"}.`,
      variant: "success",
    });
  }

  function toggleStatus(u: AdminUser) {
    const next = u.status === "active" ? "suspended" : "active";
    patch(u.id, (x) => ({ ...x, status: next }));
    toast(next === "suspended" ? "Usuário suspenso" : "Usuário reativado", {
      description: `${u.name} foi ${next === "suspended" ? "suspenso" : "reativado"}.`,
      variant: next === "suspended" ? "info" : "success",
    });
  }

  const SortHeader = ({ label, k, className }: { label: string; k: SortKey; className?: string }) => (
    <th className={cn("py-2.5 pr-4 font-medium", className)}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sortKey === k ? "text-amber-400" : "text-zinc-600")} aria-hidden />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            aria-label="Buscar usuários"
            className="pl-9"
          />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value as RoleFilter)} aria-label="Filtrar por papel" className="sm:w-40">
          <option value="all">Todos os papéis</option>
          <option value="admin">Admins</option>
          <option value="common">Comuns</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filtrar por status" className="sm:w-40">
          <option value="all">Todos os status</option>
          <option value="active">Ativos</option>
          <option value="suspended">Suspensos</option>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-5">
          {users === null ? (
            <Skeleton className="h-64 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState variant="search" title="Nenhum usuário encontrado" description="Ajuste a busca ou os filtros aplicados." />
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-500">
                {filtered.length} de {users.length} usuários
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-500">
                      <SortHeader label="Usuário" k="name" />
                      <th className="py-2.5 pr-4 font-medium">Papel</th>
                      <th className="py-2.5 pr-4 font-medium">Status</th>
                      <SortHeader label="Projetos" k="projects" />
                      <SortHeader label="Cortes" k="cuts" />
                      <SortHeader label="Último acesso" k="lastAccess" />
                      <th className="py-2.5 text-right font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <tr key={u.id} className="border-b border-line/50 hover:bg-white/[0.02]">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-zinc-100">{u.name}</p>
                          <p className="text-xs text-zinc-500">{u.email}</p>
                        </td>
                        <td className="py-3 pr-4">
                          {u.role === "admin" ? (
                            <Badge variant="warning"><ShieldCheck className="h-3 w-3" aria-hidden /> Admin</Badge>
                          ) : (
                            <Badge variant="outline">Comum</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {u.status === "active" ? (
                            <Badge variant="success">Ativo</Badge>
                          ) : (
                            <Badge variant="danger">Suspenso</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono text-zinc-300">{u.projects}</td>
                        <td className="py-3 pr-4 font-mono text-zinc-300">{u.cuts.toLocaleString("pt-BR")}</td>
                        <td className="py-3 pr-4 text-xs text-zinc-500">{timeAgo(u.lastAccess, MOCK_NOW)}</td>
                        <td className="py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDetail(u)}
                              aria-label={`Ver detalhes de ${u.name}`}
                              title="Ver detalhes"
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleRole(u)}
                              aria-label={u.role === "admin" ? `Rebaixar ${u.name}` : `Promover ${u.name} a admin`}
                              title={u.role === "admin" ? "Rebaixar a comum" : "Promover a admin"}
                            >
                              {u.role === "admin" ? (
                                <ShieldMinus className="h-4 w-4 text-amber-400" aria-hidden />
                              ) : (
                                <ShieldPlus className="h-4 w-4 text-amber-400" aria-hidden />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => toggleStatus(u)}
                              aria-label={u.status === "active" ? `Suspender ${u.name}` : `Reativar ${u.name}`}
                              title={u.status === "active" ? "Suspender" : "Reativar"}
                            >
                              {u.status === "active" ? (
                                <Ban className="h-4 w-4 text-rose-400" aria-hidden />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Drawer/modal de detalhes */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Usuário"}
        description={detail?.email}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {detail.role === "admin" ? <Badge variant="warning"><ShieldCheck className="h-3 w-3" aria-hidden /> Admin</Badge> : <Badge variant="outline">Comum</Badge>}
              {detail.status === "active" ? <Badge variant="success">Ativo</Badge> : <Badge variant="danger">Suspenso</Badge>}
              <Badge variant="accent">Plano {detail.plan}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-line bg-surface-1 p-3">
                <dt className="text-xs text-zinc-500">Projetos</dt>
                <dd className="mt-0.5 text-lg font-bold text-white">{detail.projects}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface-1 p-3">
                <dt className="text-xs text-zinc-500">Cortes gerados</dt>
                <dd className="mt-0.5 text-lg font-bold text-white">{detail.cuts.toLocaleString("pt-BR")}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface-1 p-3">
                <dt className="text-xs text-zinc-500">Último acesso</dt>
                <dd className="mt-0.5 text-sm font-medium text-zinc-200">{timeAgo(detail.lastAccess, MOCK_NOW)}</dd>
              </div>
              <div className="rounded-xl border border-line bg-surface-1 p-3">
                <dt className="text-xs text-zinc-500">Cadastro</dt>
                <dd className="mt-0.5 text-sm font-medium text-zinc-200">{formatDate(detail.createdAt)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" variant="secondary" onClick={() => toggleRole(detail)}>
                {detail.role === "admin" ? <ShieldMinus className="h-4 w-4" aria-hidden /> : <ShieldPlus className="h-4 w-4" aria-hidden />}
                {detail.role === "admin" ? "Rebaixar a comum" : "Promover a admin"}
              </Button>
              <Button
                size="sm"
                variant={detail.status === "active" ? "danger" : "primary"}
                onClick={() => toggleStatus(detail)}
              >
                {detail.status === "active" ? <Ban className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                {detail.status === "active" ? "Suspender" : "Reativar"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
