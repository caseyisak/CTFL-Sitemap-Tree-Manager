export interface SitemapNode {
  id: string
  title: string
  slug: string
  type: 'root' | 'section' | 'page'
  status: 'published' | 'draft' | 'changed'
  children: SitemapNode[]
  isExpanded?: boolean
  excludeFromSitemap?: boolean
}

export interface DragState {
  isDragging: boolean
  draggedNodeId: string | null
  targetNodeId: string | null
  dropPosition: 'before' | 'after' | 'inside' | null
}

export interface TreeContext {
  selectedNodeId: string | null
  currentPageId: string | null
  expandedNodes: Set<string>
  dragState: DragState
}

export const MAX_DEPTH = 5

export const initialSitemapData: SitemapNode = {
  id: 'root',
  title: 'Project',
  slug: '',
  type: 'root',
  status: 'published',
  isExpanded: true,
  children: [
    {
      id: 'dashboard',
      title: 'Dashboard',
      slug: 'dashboard',
      type: 'section',
      status: 'published',
      isExpanded: true,
      children: [
        { id: 'overview', title: 'Overview', slug: 'overview', type: 'page', status: 'published', children: [] },
        { id: 'my-projects', title: 'My projects', slug: 'my-projects', type: 'page', status: 'draft', children: [] },
        { id: 'my-tasks', title: 'My tasks', slug: 'my-tasks', type: 'page', status: 'changed', children: [] },
        { id: 'company-card', title: 'Company card', slug: 'company-card', type: 'page', status: 'published', children: [] },
        { id: 'user-card', title: 'User card', slug: 'user-card', type: 'page', status: 'published', children: [] },
      ],
    },
    {
      id: 'project',
      title: 'Project',
      slug: 'project',
      type: 'section',
      status: 'published',
      isExpanded: true,
      children: [
        { id: 'project-overview', title: 'Overview', slug: 'overview', type: 'page', status: 'published', children: [] },
        {
          id: 'tasks',
          title: 'Tasks',
          slug: 'tasks',
          type: 'section',
          status: 'published',
          isExpanded: true,
          children: [
            { id: 'task-details', title: 'Task list details', slug: 'details', type: 'page', status: 'published', children: [] },
            { id: 'add-task', title: 'Add/edit task list', slug: 'edit', type: 'page', status: 'draft', children: [] },
            { id: 'reorder-tasks', title: 'Reorder tasks', slug: 'reorder', type: 'page', status: 'published', children: [] },
          ],
        },
        {
          id: 'milestones',
          title: 'Milestones',
          slug: 'milestones',
          type: 'section',
          status: 'changed',
          isExpanded: true,
          children: [
            { id: 'milestone-details', title: 'Milestones details', slug: 'details', type: 'page', status: 'published', children: [] },
            { id: 'add-milestone', title: 'Add/edit milestones', slug: 'edit', type: 'page', status: 'published', children: [] },
          ],
        },
        {
          id: 'forms',
          title: 'Forms',
          slug: 'forms',
          type: 'section',
          status: 'published',
          isExpanded: true,
          children: [
            { id: 'submit-form', title: 'Submit form', slug: 'submit', type: 'page', status: 'published', children: [] },
            { id: 'add-form', title: 'Add/edit form', slug: 'edit', type: 'page', status: 'draft', children: [] },
          ],
        },
        { id: 'people', title: 'People', slug: 'people', type: 'page', status: 'published', children: [] },
        { id: 'permissions', title: 'Permissions', slug: 'permissions', type: 'page', status: 'published', children: [] },
      ],
    },
    {
      id: 'account',
      title: 'Account',
      slug: 'account',
      type: 'section',
      status: 'published',
      isExpanded: true,
      children: [
        { id: 'my-account', title: 'My account', slug: 'profile', type: 'page', status: 'published', children: [] },
        { id: 'update-profile', title: 'Update profile', slug: 'update-profile', type: 'page', status: 'published', children: [] },
        { id: 'change-password', title: 'Change password', slug: 'password', type: 'page', status: 'draft', children: [] },
        { id: 'update-avatar', title: 'Update avatar', slug: 'avatar', type: 'page', status: 'published', children: [] },
      ],
    },
    {
      id: 'administration',
      title: 'Administration',
      slug: 'admin',
      type: 'section',
      status: 'published',
      isExpanded: true,
      children: [
        { id: 'admin-index', title: 'Index', slug: 'index', type: 'page', status: 'published', children: [] },
        {
          id: 'company',
          title: 'Company',
          slug: 'company',
          type: 'section',
          status: 'published',
          isExpanded: true,
          children: [
            { id: 'company-info', title: 'Update owner company info', slug: 'info', type: 'page', status: 'published', children: [] },
            { id: 'company-logo', title: 'Update logo', slug: 'logo', type: 'page', status: 'published', children: [] },
            { id: 'company-user', title: 'Add/edit user', slug: 'user', type: 'page', status: 'draft', children: [] },
          ],
        },
        {
          id: 'clients',
          title: 'Clients',
          slug: 'clients',
          type: 'section',
          status: 'published',
          isExpanded: true,
          children: [
            { id: 'client-details', title: 'Client company details', slug: 'details', type: 'page', status: 'published', children: [] },
            { id: 'add-client', title: 'Add/edit client company', slug: 'edit', type: 'page', status: 'published', children: [] },
            { id: 'client-logo', title: 'Update logo', slug: 'logo', type: 'page', status: 'published', children: [] },
            { id: 'client-permissions', title: 'Update permissions (per company)', slug: 'permissions', type: 'page', status: 'changed', children: [] },
            { id: 'client-user', title: 'Add/edit user', slug: 'user', type: 'page', status: 'published', children: [] },
          ],
        },
        {
          id: 'configuration',
          title: 'Configuration',
          slug: 'config',
          type: 'section',
          status: 'published',
          isExpanded: true,
          children: [
            { id: 'config-general', title: 'General', slug: 'general', type: 'page', status: 'published', children: [] },
            { id: 'config-mailing', title: 'Mailing', slug: 'mailing', type: 'page', status: 'published', children: [] },
          ],
        },
      ],
    },
  ],
}
