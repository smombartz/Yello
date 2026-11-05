import type { ReactNode } from 'react';
import type { ConfigProviderProps, PaginationProps, UploadProps } from 'antd';
import { Icon } from '../components/Icon';

const close = <Icon name="xmark" />;
const clear = <Icon name="circle-xmark-solid" />;
const chevronDown = <Icon name="chevron-down" />;
const loading = <Icon name="spinner" spin />;
const search = <Icon name="magnifying-glass" />;

/** Ant's status icons (filled, like Ant's own); Ant colours them through `.anticon` */
export const statusIcons = {
  success: <Icon name="circle-check-solid" />,
  info: <Icon name="circle-info-solid" />,
  warning: <Icon name="circle-exclamation-solid" />,
  error: <Icon name="circle-xmark-solid" />,
} satisfies Record<'success' | 'info' | 'warning' | 'error', ReactNode>;

/** Every built-in icon Ant lets us set once, for the whole app */
export const antIconConfig = {
  button: { loadingIcon: loading },
  spin: { indicator: <Icon name="spinner" spin /> },
  select: { suffixIcon: chevronDown, clearIcon: clear, removeIcon: close, menuItemSelectedIcon: <Icon name="check" />, loadingIcon: loading },
  cascader: { suffixIcon: chevronDown, clearIcon: clear, removeIcon: close, expandIcon: <Icon name="chevron-right" />, loadingIcon: loading, searchIcon: search },
  treeSelect: { switcherIcon: chevronDown },
  datePicker: { suffixIcon: <Icon name="calendar" />, clearIcon: clear },
  timePicker: { suffixIcon: <Icon name="clock" />, clearIcon: clear },
  inputSearch: { searchIcon: search },
  modal: { closeIcon: close, successIcon: statusIcons.success, infoIcon: statusIcons.info, warningIcon: statusIcons.warning, errorIcon: statusIcons.error },
  alert: { closeIcon: close, successIcon: statusIcons.success, infoIcon: statusIcons.info, warningIcon: statusIcons.warning, errorIcon: statusIcons.error },
  drawer: { closeIcon: close },
  notification: { closeIcon: close },
  tag: { closeIcon: close },
  tour: { closeIcon: close },
  image: { preview: { closeIcon: close } },
  tabs: { moreIcon: <Icon name="ellipsis" />, addIcon: <Icon name="plus" />, removeIcon: close },
  breadcrumb: { separator: <Icon name="chevron-right" />, dropdownIcon: chevronDown },
  transfer: { selectionsIcon: chevronDown },
  floatButton: { backTopIcon: <Icon name="arrow-up" /> },
  collapse: {
    expandIcon: ({ isActive }) => <Icon name="chevron-right" className={isActive ? 'yello-icon--rotate-90' : undefined} />,
  },
  menu: {
    expandIcon: ({ isOpen }) => <Icon name="chevron-down" className={isOpen ? 'yello-icon--rotate-180' : undefined} />,
  },
  table: {
    expandable: {
      expandIcon: ({ expanded, onExpand, record }) => (
        <button
          type="button"
          className="yello-table-expand"
          aria-label={expanded ? 'Collapse row' : 'Expand row'}
          aria-expanded={expanded}
          onClick={(e) => onExpand(record, e)}
        >
          <Icon name="chevron-right" className={expanded ? 'yello-icon--rotate-90' : undefined} />
        </button>
      ),
    },
  },
} satisfies Partial<ConfigProviderProps>;

/** Pagination has no global icon setting; same markup as Ant's own so its styles still apply */
const jump = (name: 'chevrons-left' | 'chevrons-right') => (
  <a className="ant-pagination-item-link">
    <div className="ant-pagination-item-container">
      <Icon name={name} className="ant-pagination-item-link-icon" />
      <span className="ant-pagination-item-ellipsis"><Icon name="ellipsis" /></span>
    </div>
  </a>
);
export const paginationIcons = {
  prevIcon: <button type="button" className="ant-pagination-item-link" tabIndex={-1}><Icon name="chevron-left" /></button>,
  nextIcon: <button type="button" className="ant-pagination-item-link" tabIndex={-1}><Icon name="chevron-right" /></button>,
  jumpPrevIcon: jump('chevrons-left'),
  jumpNextIcon: jump('chevrons-right'),
} satisfies Partial<PaginationProps>;

/** Month/year arrows inside the date and time panels */
export const pickerPanelIcons = {
  prevIcon: <Icon name="chevron-left" />,
  nextIcon: <Icon name="chevron-right" />,
  superPrevIcon: <Icon name="chevrons-left" />,
  superNextIcon: <Icon name="chevrons-right" />,
};

export const passwordIconRender = (visible: boolean) => <Icon name={visible ? 'eye' : 'eye-slash'} />;

export const uploadListIcons = {
  iconRender: () => <Icon name="paperclip" />,
  showUploadList: { removeIcon: <Icon name="trash" />, downloadIcon: <Icon name="download" />, previewIcon: <Icon name="eye" /> },
} satisfies Partial<UploadProps>;

export const copyableIcons = [<Icon key="copy" name="copy" />, <Icon key="done" name="check" />];
