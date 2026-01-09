// src/app/models/NavItem.ts

export type NavItem = NavGroup | NavLink;

export type NavGroup = { 
    type: 'group';
    id: string;
    label: string;
    icon?: string;
    children: NavItem[];
};

export type NavLink = {
    type: 'link';
    id: string;
    label: string;
    route: string;
    icon?: string;
};
