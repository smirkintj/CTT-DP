'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AdminProductConfig, CountryConfig } from '../types';
import { Trash2, Plus, Package, Bell, Users, Search, X, RotateCcw, UserPlus, Info } from 'lucide-react';
import { notify } from '../lib/notify';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass } from '../components/ui/formClasses';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface AdminDatabaseProps {}

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAKEHOLDER';
  countryCode: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTaskCount: number;
  productAccesses: Array<{ id: string; name: string; slug: string }>;
};

type UserDrawerMode = 'create' | 'edit';

export const AdminDatabase: React.FC<AdminDatabaseProps> = () => {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? '';
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'countries' | 'products' | 'notifications' | 'users'>('countries');

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/countries').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/modules').then((r) => r.ok ? r.json() : []),
    ]).then(([c, m]) => {
      if (Array.isArray(c)) setCountries(c);
      if (Array.isArray(m)) setModules(m);
    }).catch(() => {});
  }, []);
  const [emailSettings, setEmailSettings] = useState({
    enableReminders: false,
    daysBefore: 3
  });
  const [savedEmailSettings, setSavedEmailSettings] = useState({
    enableReminders: false,
    daysBefore: 3
  });
  const [emailSaveState, setEmailSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Country Input State
  const [newCountryName, setNewCountryName] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');

  // Module Input State
  const [newModule, setNewModule] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newTargetSystemName, setNewTargetSystemName] = useState('');
  const [newTargetSystemUrl, setNewTargetSystemUrl] = useState('');
  const [products, setProducts] = useState<AdminProductConfig[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [jiraProjectKeyInput, setJiraProjectKeyInput] = useState('');
  const [jiraStatusesInput, setJiraStatusesInput] = useState('');
  const [jiraInUatTransitionInput, setJiraInUatTransitionInput] = useState('');
  const [jiraReadyToDeployTransitionInput, setJiraReadyToDeployTransitionInput] = useState('');
  const [jiraBaseUrlInput, setJiraBaseUrlInput] = useState('');
  const [jiraEmailInput, setJiraEmailInput] = useState('');
  const [jiraTokenInput, setJiraTokenInput] = useState('');
  const [jiraTokenSet, setJiraTokenSet] = useState(false);
  const [jiraTokenEditing, setJiraTokenEditing] = useState(false);
  const [jiraSaveState, setJiraSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [productHelpfulLinks, setProductHelpfulLinks] = useState<{ id: string; label: string; url: string }[]>([]);
  const [savedProductHelpfulLinks, setSavedProductHelpfulLinks] = useState<{ id: string; label: string; url: string }[]>([]);
  const [productHelpfulLinksSaveState, setProductHelpfulLinksSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [productLinksSubTab, setProductLinksSubTab] = useState<'modules' | 'targetSystems' | 'helpfulLinks' | 'notifications' | 'jira'>('modules');
  const [productLinksLoading, setProductLinksLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {}
  });
  const [userSearch, setUserSearch] = useState('');
  const [userCountryFilter, setUserCountryFilter] = useState<'ALL' | string>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [userProductFilter, setUserProductFilter] = useState<'ALL' | string>('ALL');
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [userDrawerMode, setUserDrawerMode] = useState<UserDrawerMode>('create');
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    countryCode: '',
    role: 'STAKEHOLDER' as 'ADMIN' | 'STAKEHOLDER',
    isActive: true,
    productIds: [] as string[]
  });
  const [tempPassword, setTempPassword] = useState('');
  const [productTeamsConfigs, setProductTeamsConfigs] = useState<Record<string, {
    teamsWebhookUrl: string;
    isActive: boolean;
    notifyTaskAssigned: boolean;
    notifyReminder: boolean;
    notifySignedOff: boolean;
    notifyFailedStep: boolean;
  }>>({});
  const [savedProductTeamsConfigs, setSavedProductTeamsConfigs] = useState<Record<string, {
    teamsWebhookUrl: string;
    isActive: boolean;
    notifyTaskAssigned: boolean;
    notifyReminder: boolean;
    notifySignedOff: boolean;
    notifyFailedStep: boolean;
  }>>({});
  const [productTeamsSaveState, setProductTeamsSaveState] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [productTeamsTestState, setProductTeamsTestState] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});
  useEffect(() => {
    fetch('/api/admin/email-settings')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const loaded = {
          enableReminders: data.enabled === true,
          daysBefore: typeof data.daysBefore === 'number' ? data.daysBefore : 3
        };
        setEmailSettings(loaded);
        setSavedEmailSettings(loaded);
      })
      .catch(() => {});
  }, []);

  const loadProductConfig = async () => {
    setProductsLoading(true);
    try {
      const response = await fetch('/api/admin/task-config', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to load product settings', 'error');
        return;
      }
      if (!Array.isArray(data)) return;
      setProducts(data as AdminProductConfig[]);
      if ((data as AdminProductConfig[]).length > 0) {
        const firstId = (data as AdminProductConfig[])[0].id;
        setSelectedProductId((prev) => prev || firstId);
        setProductLinksSubTab('modules');
        setProductHelpfulLinks([]);
        setSavedProductHelpfulLinks([]);
        setProductHelpfulLinksSaveState('idle');
        setModules((data as AdminProductConfig[])[0].modules.map((module) => module.name));
        // Preload helpful links for the initially selected product
        void loadProductHelpfulLinks(firstId);
      }
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'products' && activeTab !== 'users') return;
    void loadProductConfig();
  }, [activeTab]);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to load users', 'error');
        return;
      }
      if (Array.isArray(data)) {
        setUsers(data as AdminUserRow[]);
      }
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'users') return;
    void loadUsers();
  }, [activeTab]);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;

  useEffect(() => {
    if (!selectedProduct) {
      setJiraProjectKeyInput('');
      setJiraStatusesInput('');
      setJiraInUatTransitionInput('');
      setJiraReadyToDeployTransitionInput('');
      setJiraBaseUrlInput('');
      setJiraEmailInput('');
      setJiraTokenInput('');
      setJiraTokenSet(false);
      setJiraTokenEditing(false);
      setJiraSaveState('idle');
      return;
    }
    setJiraProjectKeyInput(selectedProduct.jiraProjectKey || '');
    setJiraStatusesInput((selectedProduct.jiraPullStatuses ?? []).join(', '));
    setJiraInUatTransitionInput(selectedProduct.jiraInUatTransition || '');
    setJiraReadyToDeployTransitionInput(selectedProduct.jiraReadyToDeployTransition || '');
    setJiraBaseUrlInput(selectedProduct.jiraBaseUrl || '');
    setJiraEmailInput(selectedProduct.jiraEmail || '');
    setJiraTokenInput('');
    setJiraTokenSet(selectedProduct.jiraTokenSet ?? false);
    setJiraTokenEditing(false);
    setJiraSaveState('idle');
  }, [selectedProduct]);

  const openCreateUserDrawer = () => {
    setUserDrawerMode('create');
    setSelectedUser(null);
    setUserForm({
      name: '',
      email: '',
      countryCode: countries[0]?.code || '',
      role: 'STAKEHOLDER',
      isActive: true,
      productIds: products.length > 0 ? [products[0].id] : []
    });
    setTempPassword('');
    setIsUserDrawerOpen(true);
  };

  const openEditUserDrawer = (user: AdminUserRow) => {
    setUserDrawerMode('edit');
    setSelectedUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      countryCode: user.countryCode || '',
      role: user.role as 'ADMIN' | 'STAKEHOLDER',
      isActive: user.isActive,
      productIds: user.productAccesses.map((access) => access.id)
    });
    setTempPassword('');
    setIsUserDrawerOpen(true);
  };

  const closeUserDrawer = () => {
    if (savingUser || resettingPassword) return;
    setIsUserDrawerOpen(false);
  };

  const saveUser = async () => {
    const name = userForm.name.trim();
    const email = userForm.email.trim().toLowerCase();
    const countryCode = userForm.countryCode.trim().toUpperCase();
    const productIds = userForm.productIds;
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name) {
      notify('Name is required', 'error');
      return;
    }
    if (userDrawerMode === 'create' && !isEmailValid) {
      notify('Enter a valid email address', 'error');
      return;
    }
    const isAdminRole = userForm.role === 'ADMIN';
    if (!countryCode && !isAdminRole) {
      notify('Country is required', 'error');
      return;
    }
    if (productIds.length === 0) {
      notify('Select at least one product', 'error');
      return;
    }

    setSavingUser(true);
    try {
      if (userDrawerMode === 'create') {
        const password = tempPassword.trim();
        if (password.length < 8) {
          notify('Temporary password must be at least 8 characters', 'error');
          return;
        }

        const response = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            role: userForm.role,
            countryCode: isAdminRole ? '' : countryCode,
            temporaryPassword: password,
            productIds
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to create user', 'error');
          return;
        }
        notify('User created successfully', 'success');
      } else if (selectedUser) {
        const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            countryCode: userForm.role === 'ADMIN' ? '' : countryCode,
            isActive: userForm.isActive,
            role: userForm.role,
            productIds
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to update user', 'error');
          return;
        }
        notify('User updated successfully', 'success');
      }

      await loadUsers();
      setIsUserDrawerOpen(false);
    } finally {
      setSavingUser(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    setConfirmDialog({
      open: true,
      title: 'Reset Password',
      message: `Reset password for ${selectedUser.email}?`,
      confirmLabel: 'Reset',
      onConfirm: async () => {
        setResettingPassword(true);
        try {
          const response = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
            method: 'POST'
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) {
            notify(data?.error || 'Failed to reset password', 'error');
            return;
          }
          notify(
            data?.emailSent
              ? 'Password reset email sent successfully'
              : 'Password reset completed but email was not sent',
            data?.emailSent ? 'success' : 'error'
          );
        } finally {
          setResettingPassword(false);
        }
      }
    });
  };

  const emailSettingsDirty =
    emailSettings.enableReminders !== savedEmailSettings.enableReminders ||
    emailSettings.daysBefore !== savedEmailSettings.daysBefore;

  const hasUnsavedTeamsConfig = Object.keys(productTeamsConfigs).some((countryCode) => {
    const current = productTeamsConfigs[countryCode];
    const saved = savedProductTeamsConfigs[countryCode] || {
      teamsWebhookUrl: '',
      isActive: false,
      notifyTaskAssigned: true,
      notifyReminder: true,
      notifySignedOff: true,
      notifyFailedStep: true
    };
    return (
      current.teamsWebhookUrl !== saved.teamsWebhookUrl ||
      current.isActive !== saved.isActive ||
      current.notifyTaskAssigned !== saved.notifyTaskAssigned ||
      current.notifyReminder !== saved.notifyReminder ||
      current.notifySignedOff !== saved.notifySignedOff ||
      current.notifyFailedStep !== saved.notifyFailedStep
    );
  });
  const productHelpfulLinksDirty = JSON.stringify(productHelpfulLinks) !== JSON.stringify(savedProductHelpfulLinks);

  const filteredUsers = users.filter((user) => {
    const query = userSearch.trim().toLowerCase();
    const matchesSearch =
      !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
    const matchesCountry = userCountryFilter === 'ALL' || user.countryCode === userCountryFilter;
    const matchesStatus =
      userStatusFilter === 'ALL' ||
      (userStatusFilter === 'ACTIVE' ? user.isActive : !user.isActive);
    const matchesProduct =
      userProductFilter === 'ALL' ||
      user.productAccesses.some((p) => p.id === userProductFilter);
    return matchesSearch && matchesCountry && matchesStatus && matchesProduct;
  });

  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const handleAddCountry = () => {
      if (!newCountryName || !newCountryCode) return;
      void (async () => {
        const response = await fetch('/api/admin/countries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newCountryName, code: newCountryCode })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to add country', 'error');
          return;
        }

        const next = [...countries.filter((country) => country.code !== data.code), data].sort((a, b) =>
          a.code.localeCompare(b.code)
        );
        setCountries(next);
        setNewCountryName('');
        setNewCountryCode('');
      })();
  };

  const handleDeleteCountry = (code: string) => {
      void (async () => {
        const response = await fetch('/api/admin/countries', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to delete country', 'error');
          return;
        }
        setCountries(countries.filter((country) => country.code !== code));
      })();
  };

  const handleAddModule = () => {
      if (!selectedProductId || !newModule.trim()) return;
      void (async () => {
        const response = await fetch('/api/admin/modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: selectedProductId, name: newModule.trim() })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to add module', 'error');
          return;
        }
        await loadProductConfig();
        setNewModule('');
      })();
  };

  const handleDeleteModule = (mod: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Module',
      message: `Delete "${mod}"? Tasks using this module will have it cleared.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const response = await fetch('/api/admin/modules', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: selectedProductId, name: mod })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to delete module', 'error');
          return;
        }
        await loadProductConfig();
      }
    });
  };

  const handleAddProduct = () => {
    const name = newProductName.trim();
    if (!name) return;
    void (async () => {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to add product', 'error');
        return;
      }
      setNewProductName('');
      await loadProductConfig();
      setSelectedProductId(data.id);
      setProductLinksSubTab('modules');
      setProductHelpfulLinks([]);
      setSavedProductHelpfulLinks([]);
      setProductHelpfulLinksSaveState('idle');
    })();
  };

  const handleDeleteProduct = (productId: string) => {
    void (async () => {
      const response = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to delete product', 'error');
        return;
      }
      await loadProductConfig();
    })();
  };

  const handleAddTargetSystem = () => {
    if (!selectedProductId || !newTargetSystemName.trim()) return;
    void (async () => {
      const response = await fetch('/api/admin/target-systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProductId,
          name: newTargetSystemName.trim(),
          baseUrl: newTargetSystemUrl.trim() || null
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to add target system', 'error');
        return;
      }
      setNewTargetSystemName('');
      setNewTargetSystemUrl('');
      await loadProductConfig();
    })();
  };

  const handleDeleteTargetSystem = (name: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Target System',
      message: `Delete "${name}"? Tasks using this target system will have it cleared.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const response = await fetch('/api/admin/target-systems', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: selectedProductId, name })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to delete target system', 'error');
          return;
        }
        await loadProductConfig();
      }
    });
  };

  const loadProductHelpfulLinks = async (productId: string) => {
    setProductLinksLoading(true);
    try {
      const response = await fetch(`/api/admin/helpful-links?productId=${productId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (Array.isArray(data)) {
        setProductHelpfulLinks(data);
        setSavedProductHelpfulLinks(data);
      }
    } finally {
      setProductLinksLoading(false);
    }
  };

  const loadProductTeamsConfigs = async (productId: string) => {
    const response = await fetch(`/api/admin/teams-webhooks?productId=${productId}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data)) return;
    const next: Record<string, any> = {};
    for (const item of data) {
      if (!item?.countryCode) continue;
      next[item.countryCode] = {
        teamsWebhookUrl: item.teamsWebhookUrl || '',
        isActive: Boolean(item.isActive),
        notifyTaskAssigned: item.notifyTaskAssigned !== false,
        notifyReminder: item.notifyReminder !== false,
        notifySignedOff: item.notifySignedOff !== false,
        notifyFailedStep: item.notifyFailedStep !== false
      };
    }
    setProductTeamsConfigs(next);
    setSavedProductTeamsConfigs(next);
    setProductTeamsSaveState({});
    setProductTeamsTestState({});
  };

  const saveProductHelpfulLinks = () => {
    if (!selectedProduct) return;
    void (async () => {
      setProductHelpfulLinksSaveState('saving');
      const response = await fetch('/api/admin/helpful-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProduct.id, links: productHelpfulLinks })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setProductHelpfulLinksSaveState('error');
        notify(data?.error || 'Failed to save helpful links', 'error');
        return;
      }
      if (Array.isArray(data)) {
        setProductHelpfulLinks(data);
        setSavedProductHelpfulLinks(data);
      }
      setProductHelpfulLinksSaveState('saved');
      notify('Helpful links saved', 'success');
      window.setTimeout(() => setProductHelpfulLinksSaveState('idle'), 1200);
    })();
  };

  const handleProductSubTab = (next: 'modules' | 'targetSystems' | 'helpfulLinks' | 'notifications' | 'jira') => {
    if (productLinksSubTab === 'helpfulLinks' && next !== 'helpfulLinks' && productHelpfulLinksDirty) {
      if (!window.confirm('You have unsaved changes to Helpful Links. Leave without saving?')) return;
    }
    setProductLinksSubTab(next);
    if (next === 'notifications' && selectedProductId) {
      void loadProductTeamsConfigs(selectedProductId);
    }
  };

  const handleSaveEmailSettings = () => {
    setEmailSaveState('saving');
    fetch('/api/admin/email-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: emailSettings.enableReminders, daysBefore: emailSettings.daysBefore })
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => {
        setSavedEmailSettings({ ...emailSettings });
        setEmailSaveState('saved');
        notify('Email reminder settings saved.', 'success');
        window.setTimeout(() => setEmailSaveState('idle'), 1500);
      })
      .catch(() => {
        setEmailSaveState('error');
        notify('Failed to save email settings.', 'error');
        window.setTimeout(() => setEmailSaveState('idle'), 2000);
      });
  };

  const saveProductTeamsConfig = (countryCode: string) => {
    if (!selectedProductId) return;
    const config = productTeamsConfigs[countryCode] || {
      teamsWebhookUrl: '',
      isActive: false,
      notifyTaskAssigned: true,
      notifyReminder: true,
      notifySignedOff: true,
      notifyFailedStep: true
    };

    void (async () => {
      setProductTeamsSaveState((prev) => ({ ...prev, [countryCode]: 'saving' }));
      const response = await fetch('/api/admin/teams-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProductId, countryCode, ...config })
      });
      if (!response.ok) {
        setProductTeamsSaveState((prev) => ({ ...prev, [countryCode]: 'error' }));
        notify(`Failed to save Teams webhook for ${countryCode}`, 'error');
        return;
      }
      setSavedProductTeamsConfigs((prev) => ({ ...prev, [countryCode]: config }));
      setProductTeamsSaveState((prev) => ({ ...prev, [countryCode]: 'saved' }));
      notify(`Teams webhook saved for ${countryCode}`, 'success');
      window.setTimeout(() => {
        setProductTeamsSaveState((prev) => ({ ...prev, [countryCode]: 'idle' }));
      }, 1500);
    })();
  };

  const sendProductTeamsTest = (countryCode: string) => {
    if (!selectedProductId) return;
    void (async () => {
      setProductTeamsTestState((prev) => ({ ...prev, [countryCode]: 'sending' }));
      const response = await fetch('/api/admin/teams-webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedProductId, countryCode })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setProductTeamsTestState((prev) => ({ ...prev, [countryCode]: 'error' }));
        notify(data?.error || `Failed to send Teams test for ${countryCode}`, 'error');
        window.setTimeout(() => {
          setProductTeamsTestState((prev) => ({ ...prev, [countryCode]: 'idle' }));
        }, 2000);
        return;
      }

      setProductTeamsTestState((prev) => ({ ...prev, [countryCode]: 'sent' }));
      notify(`Teams test sent for ${countryCode}`, 'success');
      window.setTimeout(() => {
        setProductTeamsTestState((prev) => ({ ...prev, [countryCode]: 'idle' }));
      }, 1500);
    })();
  };

  const saveJiraConfig = () => {
    if (!selectedProduct) return;
    const jiraPullStatuses = jiraStatusesInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    void (async () => {
      setJiraSaveState('saving');
      const response = await fetch('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id,
          jiraProjectKey: jiraProjectKeyInput.trim(),
          jiraPullStatuses,
          jiraInUatTransition: jiraInUatTransitionInput.trim(),
          jiraReadyToDeployTransition: jiraReadyToDeployTransitionInput.trim(),
          jiraBaseUrl: jiraBaseUrlInput.trim(),
          jiraEmail: jiraEmailInput.trim(),
          ...(jiraTokenEditing ? { jiraToken: jiraTokenInput.trim() } : {})
        })
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setJiraSaveState('error');
        notify(data?.error || 'Failed to save Jira settings', 'error');
        window.setTimeout(() => setJiraSaveState('idle'), 2000);
        return;
      }

      setProducts((prev) =>
        prev.map((product) =>
          product.id === selectedProduct.id
            ? {
                ...product,
                jiraProjectKey: data.jiraProjectKey || null,
                jiraPullStatuses: Array.isArray(data.jiraPullStatuses) ? data.jiraPullStatuses : [],
                jiraInUatTransition: data.jiraInUatTransition || null,
                jiraReadyToDeployTransition: data.jiraReadyToDeployTransition || null,
                jiraBaseUrl: data.jiraBaseUrl || null,
                jiraEmail: data.jiraEmail || null,
                jiraTokenSet: data.jiraTokenSet ?? false
              }
            : product
        )
      );
      setJiraTokenSet(data.jiraTokenSet ?? false);
      setJiraTokenInput('');
      setJiraTokenEditing(false);
      setJiraSaveState('saved');
      notify(`Jira settings saved for ${selectedProduct.name}`, 'success');
      window.setTimeout(() => setJiraSaveState('idle'), 1500);
    })();
  };

  const handleTabChange = (nextTab: 'countries' | 'products' | 'notifications' | 'users') => {
    if (activeTab === 'notifications' && nextTab !== 'notifications' && (emailSettingsDirty || hasUnsavedTeamsConfig)) {
      setConfirmDialog({
        open: true,
        title: 'Unsaved Notification Settings',
        message: 'You have unsaved notification settings. Leave without saving?',
        confirmLabel: 'Leave',
        onConfirm: () => setActiveTab(nextTab)
      });
      return;
    }
    setActiveTab(nextTab);
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (activeTab === 'notifications' && (emailSettingsDirty || hasUnsavedTeamsConfig)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeTab, emailSettingsDirty, hasUnsavedTeamsConfig]);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">System Database</h1>
            <p className="text-slate-500">Manage Master Data and List of Values.</p>
        </div>

        <div className="flex gap-4 mb-6 border-b border-slate-200">
            <button 
              onClick={() => handleTabChange('countries')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'countries' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Countries
            </button>
            <button 
              onClick={() => handleTabChange('products')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'products' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Products
            </button>
            <button 
              onClick={() => handleTabChange('notifications')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notifications' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Notifications
            </button>
            <button
              onClick={() => handleTabChange('users')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'users' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Users
            </button>
        </div>

        {activeTab === 'countries' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex gap-3 mb-6 items-end bg-slate-50 p-4 rounded-lg">
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Country Name</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm" 
                           placeholder="e.g. Indonesia"
                           value={newCountryName}
                           onChange={(e) => setNewCountryName(e.target.value)}
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Code</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm uppercase" 
                           placeholder="ID"
                           maxLength={2}
                           value={newCountryCode}
                           onChange={(e) => setNewCountryCode(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={handleAddCountry}
                        className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {countries.map(c => (
                        <div key={c.code} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                                    {c.code}
                                </div>
                                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                            </div>
                            <button onClick={() => handleDeleteCountry(c.code)} className="text-slate-400 hover:text-red-500 p-1">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'products' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              {productsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
                  <div className="space-y-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                      <label className="text-xs font-semibold text-slate-500 uppercase">New Product</label>
                      <input
                        type="text"
                        className="w-full mt-2 border-slate-300 rounded-md text-sm"
                        placeholder="e.g. EasyOrder"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                      />
                      <button
                        onClick={handleAddProduct}
                        className="mt-3 bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Plus size={16} /> Add Product
                      </button>
                    </div>

                    <div className="space-y-2">
                      {products.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setProductLinksSubTab('modules');
                            setProductHelpfulLinks([]);
                            setSavedProductHelpfulLinks([]);
                            setProductHelpfulLinksSaveState('idle');
                            setModules(product.modules.map((module) => module.name));
                            void loadProductHelpfulLinks(product.id);
                          }}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                            selectedProductId === product.id
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{product.name}</p>
                              <p className={`text-xs mt-1 ${selectedProductId === product.id ? 'text-slate-300' : 'text-slate-500'}`}>
                                {product.modules.length} modules • {product.targetSystems.length} systems
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteProduct(product.id);
                              }}
                              className={`${selectedProductId === product.id ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-red-500'}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    {selectedProduct ? (
                      <>
                        {/* Product sub-tab bar */}
                        <div className="flex gap-0 border-b border-slate-200 mb-4">
                          {(['modules', 'targetSystems', 'helpfulLinks', 'notifications', 'jira'] as const).map((tab) => (
                            <button
                              key={tab}
                              onClick={() => handleProductSubTab(tab)}
                              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                                productLinksSubTab === tab
                                  ? 'border-slate-900 text-slate-900'
                                  : 'border-transparent text-slate-500 hover:text-slate-700'
                              }`}
                            >
                              {tab === 'modules' ? 'Modules' : tab === 'targetSystems' ? 'Target Systems' : tab === 'helpfulLinks' ? 'Helpful Links' : tab === 'notifications' ? 'Notifications' : 'Jira'}
                            </button>
                          ))}
                        </div>

                        {/* Modules panel */}
                        {productLinksSubTab === 'modules' && (
                          <div className="rounded-xl border border-slate-200 p-5">
                            <h3 className="text-sm font-semibold text-slate-900">Modules for {selectedProduct.name}</h3>
                            <div className="flex gap-3 mb-5 items-end bg-slate-50 p-4 rounded-lg mt-4">
                              <div className="flex-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Module Name</label>
                                <input
                                  type="text"
                                  className="w-full mt-1 border-slate-300 rounded-md text-sm"
                                  placeholder="e.g. Logistics"
                                  value={newModule}
                                  onChange={(e) => setNewModule(e.target.value)}
                                />
                              </div>
                              <button
                                onClick={handleAddModule}
                                className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                              >
                                <Plus size={16} /> Add
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {selectedProduct.modules.map((module) => (
                                <div key={module.id} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <Package size={18} className="text-slate-400" />
                                    <span className="text-sm font-medium text-slate-900">{module.name}</span>
                                  </div>
                                  <button onClick={() => handleDeleteModule(module.name)} className="text-slate-400 hover:text-red-500 p-1">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Target Systems panel */}
                        {productLinksSubTab === 'targetSystems' && (
                          <div className="rounded-xl border border-slate-200 p-5">
                            <h3 className="text-sm font-semibold text-slate-900">Target Systems for {selectedProduct.name}</h3>
                            <div className="grid gap-3 bg-slate-50 p-4 rounded-lg mt-4 md:grid-cols-[1fr,1.2fr,auto] md:items-end">
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">System Name</label>
                                <input
                                  type="text"
                                  className="w-full mt-1 border-slate-300 rounded-md text-sm"
                                  placeholder="e.g. Customer Portal"
                                  value={newTargetSystemName}
                                  onChange={(e) => setNewTargetSystemName(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Base URL</label>
                                <input
                                  type="url"
                                  className="w-full mt-1 border-slate-300 rounded-md text-sm"
                                  placeholder="https://..."
                                  value={newTargetSystemUrl}
                                  onChange={(e) => setNewTargetSystemUrl(e.target.value)}
                                />
                              </div>
                              <button
                                onClick={handleAddTargetSystem}
                                className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                              >
                                <Plus size={16} /> Add
                              </button>
                            </div>

                            <div className="space-y-3 mt-5">
                              {selectedProduct.targetSystems.map((targetSystem) => (
                                <div key={targetSystem.id} className="flex justify-between items-center gap-3 p-3 border border-slate-200 rounded-lg">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900">{targetSystem.name}</p>
                                    <p className="text-xs text-slate-500 truncate">{targetSystem.baseUrl || 'No launch URL configured yet'}</p>
                                  </div>
                                  <button onClick={() => handleDeleteTargetSystem(targetSystem.name)} className="text-slate-400 hover:text-red-500 p-1">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Helpful Links panel */}
                        {productLinksSubTab === 'helpfulLinks' && (
                          <div className="rounded-xl border border-slate-200 p-5 space-y-4">
                            <p className="text-xs text-slate-500">
                              Configure links shown in the stakeholder dashboard sidebar for <strong>{selectedProduct.name}</strong> users. Max 5 links.
                            </p>

                            {productLinksLoading ? (
                              <div className="space-y-2">
                                {[1, 2].map((n) => (
                                  <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {productHelpfulLinks.map((link, index) => (
                                  <div key={link.id || index} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
                                    <input
                                      type="text"
                                      value={link.label}
                                      onChange={(e) =>
                                        setProductHelpfulLinks((prev) =>
                                          prev.map((item, i) => (i === index ? { ...item, label: e.target.value } : item))
                                        )
                                      }
                                      className={fieldBaseClass}
                                      placeholder="Link label"
                                    />
                                    <input
                                      type="url"
                                      value={link.url}
                                      onChange={(e) =>
                                        setProductHelpfulLinks((prev) =>
                                          prev.map((item, i) => (i === index ? { ...item, url: e.target.value } : item))
                                        )
                                      }
                                      className={fieldBaseClass}
                                      placeholder="https://..."
                                    />
                                    <button
                                      onClick={() =>
                                        setProductHelpfulLinks((prev) => prev.filter((_, i) => i !== index))
                                      }
                                      className="w-7 h-7 flex items-center justify-center rounded-md bg-red-50 text-red-500 hover:bg-red-100 text-base leading-none"
                                      aria-label="Remove link"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {productHelpfulLinks.length < 5 && (
                              <button
                                onClick={() =>
                                  setProductHelpfulLinks((prev) => [
                                    ...prev,
                                    { id: '', label: '', url: '' }
                                  ])
                                }
                                className="flex items-center gap-2 text-xs text-slate-600 border border-dashed border-slate-300 rounded-lg px-3 py-2 hover:bg-slate-50"
                              >
                                <Plus size={14} /> Add link
                                <span className="text-slate-400">({5 - productHelpfulLinks.length} of 5 remaining)</span>
                              </button>
                            )}

                            <div className="flex justify-end pt-2 border-t border-slate-100">
                              <button
                                onClick={saveProductHelpfulLinks}
                                disabled={!productHelpfulLinksDirty || productHelpfulLinksSaveState === 'saving'}
                                className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {productHelpfulLinksSaveState === 'saving'
                                  ? 'Saving...'
                                  : productHelpfulLinksSaveState === 'saved'
                                  ? 'Saved'
                                  : 'Save Links'}
                              </button>
                            </div>
                          </div>
                        )}
                        {/* Notifications panel */}
                        {productLinksSubTab === 'notifications' && (
                          <div className="rounded-xl border border-slate-200 p-5 space-y-4">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900">Teams Notifications for {selectedProduct.name}</h3>
                              <p className="text-xs text-slate-500 mt-1">
                                Configure a Microsoft Teams webhook per market. Save the webhook first, then use Send Test to verify.
                              </p>
                            </div>
                            <div className="space-y-4">
                              {countries.map((country) => {
                                const config = productTeamsConfigs[country.code] || {
                                  teamsWebhookUrl: '',
                                  isActive: false,
                                  notifyTaskAssigned: true,
                                  notifyReminder: true,
                                  notifySignedOff: true,
                                  notifyFailedStep: true
                                };
                                return (
                                  <div key={country.code} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                                    <div className="flex items-center justify-between mb-2">
                                      <p className="text-sm font-semibold text-slate-800">{country.code} — {country.name}</p>
                                      <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                                        <input
                                          type="checkbox"
                                          checked={config.isActive}
                                          onChange={(e) =>
                                            setProductTeamsConfigs((prev) => ({
                                              ...prev,
                                              [country.code]: { ...config, isActive: e.target.checked }
                                            }))
                                          }
                                        />
                                        Active
                                      </label>
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="https://...powerautomate.com/..."
                                      className="w-full border-slate-300 rounded-md text-sm mb-3"
                                      value={config.teamsWebhookUrl}
                                      onChange={(e) =>
                                        setProductTeamsConfigs((prev) => ({
                                          ...prev,
                                          [country.code]: { ...config, teamsWebhookUrl: e.target.value }
                                        }))
                                      }
                                    />
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                                      {([
                                        ['notifyTaskAssigned', 'Task assigned', null],
                                        ['notifyReminder', 'Reminder', 'Sent automatically each day when a task is due within the configured window (default: 3 days). Managed under the Notifications tab.'],
                                        ['notifySignedOff', 'Signed off', null],
                                        ['notifyFailedStep', 'Failed step', null]
                                      ] as const).map(([field, label, tooltip]) => (
                                        <label key={field} className="inline-flex items-center gap-1.5">
                                          <input
                                            type="checkbox"
                                            checked={config[field]}
                                            onChange={(e) =>
                                              setProductTeamsConfigs((prev) => ({
                                                ...prev,
                                                [country.code]: { ...config, [field]: e.target.checked }
                                              }))
                                            }
                                          />
                                          {label}
                                          {tooltip && (
                                            <span className="relative group inline-flex">
                                              <Info size={12} className="text-slate-400 cursor-help" />
                                              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-md bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-100 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg">
                                                {tooltip}
                                              </span>
                                            </span>
                                          )}
                                        </label>
                                      ))}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => sendProductTeamsTest(country.code)}
                                        disabled={productTeamsTestState[country.code] === 'sending'}
                                        className="border border-slate-200 bg-white text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
                                      >
                                        {productTeamsTestState[country.code] === 'sending'
                                          ? 'Sending Test...'
                                          : productTeamsTestState[country.code] === 'sent'
                                            ? 'Test Sent ✓'
                                            : 'Send Test'}
                                      </button>
                                      <button
                                        onClick={() => saveProductTeamsConfig(country.code)}
                                        disabled={productTeamsSaveState[country.code] === 'saving'}
                                        className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-800 disabled:opacity-60"
                                      >
                                        {productTeamsSaveState[country.code] === 'saving'
                                          ? 'Saving...'
                                          : productTeamsSaveState[country.code] === 'saved'
                                            ? 'Saved ✓'
                                            : 'Save'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {productLinksSubTab === 'jira' && (
                          <div className="rounded-xl border border-slate-200 p-5 space-y-4">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900">Jira Intake for {selectedProduct.name}</h3>
                              <p className="text-xs text-slate-500 mt-1">
                                Configure the Jira project key and which statuses should be pulled into the admin intake page.
                              </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[220px,1fr]">
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Jira Project Key</label>
                                <input
                                  type="text"
                                  className={fieldBaseClass}
                                  placeholder="e.g. EO"
                                  value={jiraProjectKeyInput}
                                  onChange={(event) => setJiraProjectKeyInput(event.target.value.toUpperCase())}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Statuses to Pull</label>
                                <input
                                  type="text"
                                  className={fieldBaseClass}
                                  placeholder="Ready for UAT, In UAT"
                                  value={jiraStatusesInput}
                                  onChange={(event) => setJiraStatusesInput(event.target.value)}
                                />
                                <p className="mt-1 text-xs text-slate-400">
                                  Comma-separated. Example: <span className="font-medium text-slate-500">Ready for UAT, In UAT</span>
                                </p>
                              </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">→ "In UAT" Transition Name</label>
                                <input
                                  type="text"
                                  className={fieldBaseClass}
                                  placeholder="In UAT"
                                  value={jiraInUatTransitionInput}
                                  onChange={(event) => setJiraInUatTransitionInput(event.target.value)}
                                />
                                <p className="mt-1 text-xs text-slate-400">Jira transition to fire when task is marked Ready</p>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">→ "Ready to Deploy" Transition Name</label>
                                <input
                                  type="text"
                                  className={fieldBaseClass}
                                  placeholder="Ready to Deploy"
                                  value={jiraReadyToDeployTransitionInput}
                                  onChange={(event) => setJiraReadyToDeployTransitionInput(event.target.value)}
                                />
                                <p className="mt-1 text-xs text-slate-400">Jira transition to fire when task is signed off</p>
                              </div>
                            </div>

                            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
                              <p className="text-xs font-semibold text-blue-800">Per-product Jira Credentials</p>
                              <p className="text-xs text-blue-600">Override the global Jira API credentials for this product. Leave blank to use the server-side env vars instead.</p>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Jira Base URL</label>
                                <input
                                  type="url"
                                  className={fieldBaseClass}
                                  placeholder="https://yourcompany.atlassian.net"
                                  value={jiraBaseUrlInput}
                                  onChange={(event) => setJiraBaseUrlInput(event.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Jira API Email</label>
                                <input
                                  type="email"
                                  className={fieldBaseClass}
                                  placeholder="you@company.com"
                                  value={jiraEmailInput}
                                  onChange={(event) => setJiraEmailInput(event.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase">Jira API Token</label>
                                {jiraTokenSet && !jiraTokenEditing ? (
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="flex-1 text-xs text-slate-500 font-mono bg-slate-100 rounded-lg px-3 py-2">••••••••••••••••</span>
                                    <button type="button" onClick={() => setJiraTokenEditing(true)} className="text-xs text-blue-600 hover:underline shrink-0">Replace</button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 mt-1">
                                    <input
                                      type="password"
                                      className={`${fieldBaseClass} flex-1`}
                                      placeholder="Paste API token"
                                      value={jiraTokenInput}
                                      onChange={(event) => setJiraTokenInput(event.target.value)}
                                      autoComplete="new-password"
                                    />
                                    {jiraTokenSet && (
                                      <button type="button" onClick={() => { setJiraTokenEditing(false); setJiraTokenInput(''); }} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Cancel</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-end pt-2 border-t border-slate-100">
                              <button
                                onClick={saveJiraConfig}
                                disabled={jiraSaveState === 'saving'}
                                className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-800 disabled:opacity-60"
                              >
                                {jiraSaveState === 'saving'
                                  ? 'Saving...'
                                  : jiraSaveState === 'saved'
                                    ? 'Saved ✓'
                                    : 'Save Jira Settings'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 p-10 text-sm text-slate-500 text-center">
                        Add your first product to start configuring modules, systems, and user access.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
        )}

        {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="text-amber-500 text-sm">🚧</span>
                  <p className="text-xs font-medium text-amber-700">This section is under construction. Settings saved here are not yet active.</p>
                </div>
                <div className="flex items-start gap-3">
                    <Bell className="text-slate-500 mt-0.5" size={18} />
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">Email Reminder Settings</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Automated reminders run daily at 9 AM MYT via Vercel Cron. Emails go to stakeholders whose tasks are due within the configured window.
                        </p>
                    </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={emailSettings.enableReminders}
                      onChange={(e) => setEmailSettings((prev) => ({ ...prev, enableReminders: e.target.checked }))}
                    />
                    Enable automated reminder emails
                </label>

                <div className="max-w-xs">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Remind N days before due date</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      className="w-full mt-1 border-slate-300 rounded-md text-sm"
                      value={emailSettings.daysBefore}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          setEmailSettings((prev) => ({ ...prev, daysBefore: val }));
                        }
                      }}
                    />
                    <p className="text-xs text-slate-400 mt-1">Tasks due within this many days will trigger a reminder. Default: 3.</p>
                </div>

                <div className="flex justify-end">
                    <button
                      onClick={handleSaveEmailSettings}
                      disabled={!emailSettingsDirty || emailSaveState === 'saving'}
                      className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800"
                    >
                      {emailSaveState === 'saving'
                        ? 'Saving...'
                        : emailSaveState === 'saved'
                          ? 'Saved'
                          : 'Save Settings'}
                    </button>
                </div>


            </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
              <div className="flex items-center gap-2 text-slate-700">
                <Users size={18} />
                <h3 className="text-sm font-semibold">User Management</h3>
              </div>
              <button onClick={openCreateUserDrawer} className={primaryButtonClass}>
                <span className="inline-flex items-center gap-2">
                  <UserPlus size={16} />
                  Add User
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
              <div className="md:col-span-2 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search by name or email"
                  className={`${fieldBaseClass} pl-9`}
                />
              </div>
              <select
                value={userCountryFilter}
                onChange={(event) => setUserCountryFilter(event.target.value)}
                className={selectBaseClass}
              >
                <option value="ALL">All countries</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.code} - {country.name}
                  </option>
                ))}
              </select>
              <select
                value={userProductFilter}
                onChange={(event) => setUserProductFilter(event.target.value)}
                className={selectBaseClass}
              >
                <option value="ALL">All products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <select
                value={userStatusFilter}
                onChange={(event) => setUserStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'DISABLED')}
                className={selectBaseClass}
              >
                <option value="ALL">All status</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 w-[18%]">Name</th>
                    <th className="px-3 py-3 w-[22%]">Email</th>
                    <th className="px-3 py-3 w-[8%]">Role</th>
                    <th className="px-3 py-3 w-[8%]">Country</th>
                    <th className="px-3 py-3 w-[18%]">Products</th>
                    <th className="px-3 py-3 w-[10%]">Status</th>
                    <th className="px-3 py-3 w-[14%]">Last Login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        onClick={() => openEditUserDrawer(user)}
                        className="cursor-pointer transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
                      >
                        <td className="px-3 py-3 font-medium text-slate-900 truncate">{user.name}</td>
                        <td className="px-3 py-3 truncate">{user.email}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            user.role === 'ADMIN' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'
                          }`}>
                            {user.role === 'ADMIN' ? 'Admin' : 'Stakeholder'}
                          </span>
                        </td>
                        <td className="px-3 py-3">{user.countryCode || '—'}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {user.productAccesses.length === 0 ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : (
                              user.productAccesses.map((product) => (
                                <span key={product.id} className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                  {product.name}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {user.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-3 py-3">{formatDateTime(user.lastLoginAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isUserDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]">
            <div className="h-full w-full max-w-md bg-white shadow-xl border-l border-slate-200 p-6 overflow-y-auto">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {userDrawerMode === 'create' ? 'Create User' : 'Manage User'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {userDrawerMode === 'create'
                      ? 'Create a user account with temporary password.'
                      : 'Update profile, status, and reset password.'}
                  </p>
                </div>
                <button onClick={closeUserDrawer} className="text-slate-500 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Name</label>
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                    className={`${fieldBaseClass} mt-1`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Email</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                    disabled={userDrawerMode === 'edit'}
                    className={`${fieldBaseClass} mt-1 ${userDrawerMode === 'edit' ? 'opacity-70 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Role</label>
                  <select
                    value={userForm.role}
                    onChange={(event) => {
                      const role = event.target.value as 'ADMIN' | 'STAKEHOLDER';
                      setUserForm((prev) => ({
                        ...prev,
                        role,
                        countryCode: role === 'ADMIN' ? '' : prev.countryCode
                      }));
                    }}
                    className={`${selectBaseClass} mt-1`}
                  >
                    <option value="STAKEHOLDER">Stakeholder</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>

                {userForm.role === 'STAKEHOLDER' && (
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Country</label>
                    <select
                      value={userForm.countryCode}
                      onChange={(event) => setUserForm((prev) => ({ ...prev, countryCode: event.target.value }))}
                      className={`${selectBaseClass} mt-1`}
                    >
                      <option value="">Select country</option>
                      {countries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.code} - {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Product Access</label>
                  <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {products.length === 0 ? (
                      <p className="text-sm text-slate-500">Create at least one product first.</p>
                    ) : (
                      products.map((product) => {
                        const checked = userForm.productIds.includes(product.id);
                        return (
                          <label key={product.id} className="flex items-start gap-3 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                setUserForm((prev) => ({
                                  ...prev,
                                  productIds: event.target.checked
                                    ? [...prev.productIds, product.id]
                                    : prev.productIds.filter((id) => id !== product.id)
                                }));
                              }}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-medium text-slate-900">{product.name}</span>
                              <span className="block text-xs text-slate-500">
                                {product.modules.length} modules • {product.targetSystems.length} target systems
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {userDrawerMode === 'create' ? (
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Temporary Password</label>
                    <input
                      type="text"
                      value={tempPassword}
                      onChange={(event) => setTempPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                      className={`${fieldBaseClass} mt-1`}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={userForm.isActive}
                          onChange={(event) => setUserForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                          disabled={selectedUser?.id === currentUserId}
                        />
                        Active account
                      </label>
                      {selectedUser?.id === currentUserId && (
                        <p className="text-xs text-slate-500 mt-1">Your own admin account cannot be disabled.</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-2">Last login</p>
                      <p className="text-sm text-slate-800">{formatDateTime(selectedUser?.lastLoginAt)}</p>
                    </div>
                  </>
                )}
              </div>

              {userDrawerMode === 'edit' && (
                <div className="mt-6">
                  <button
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className={subtleButtonClass}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw size={14} />
                      {resettingPassword ? 'Resetting...' : 'Reset Password'}
                    </span>
                  </button>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button onClick={closeUserDrawer} className={subtleButtonClass}>
                  Cancel
                </button>
                <button onClick={saveUser} disabled={savingUser} className={primaryButtonClass}>
                  {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmDialog.open}
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
          onConfirm={async () => {
            const action = confirmDialog.onConfirm;
            setConfirmDialog((prev) => ({ ...prev, open: false }));
            await action();
          }}
        />

    </div>
  );
};
