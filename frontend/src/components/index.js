/**
 * Workbench 组件导出索引
 * 方便统一导入所有组件、hooks和工具函数
 */

// Hooks
export { useHistory } from './hooks/useHistory';
export { useCanvas } from './hooks/useCanvas';
export { useChartData } from './hooks/useChartData';
export { useAssets } from './hooks/useAssets';

// 工具函数
export { loadChartToCanvas, downloadCanvas } from './utils/canvasUtils';

// 组件
export { CanvasControls } from './WorkbenchComponents/CanvasControls';
export { DataPreviewModal } from './WorkbenchComponents/DataPreviewModal';
export { RefinedImageModal } from './WorkbenchComponents/RefinedImageModal';
export { 
  Sidebar,
  DatasetSection,
  ChartTypesSection,
  VariationsSection,
  ReferencesSection,
  AssetsSection,
  EditPanel
} from './WorkbenchComponents/Sidebar';

// 常量
export * from './constants';

