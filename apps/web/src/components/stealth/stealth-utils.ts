import type { BubbleInfo, BubbleSize, BubblePattern } from '@bubbles/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActionLogEntry {
  id: string;
  timestamp: number;
  kind: 'blow' | 'pop' | 'join' | 'leave' | 'expire';
  userName: string;
  bubbleId?: string;
  size?: BubbleSize;
  color?: string;
  pattern?: BubblePattern;
}

export interface SpreadsheetRow {
  timestamp: string;
  status: string;
  assignee: string;
  task: string;
  priority: string;
  category: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Fake task name pool (>30 entries)
// ---------------------------------------------------------------------------

import i18n from '@/i18n';

function getFakeTasks(): string[] {
  return i18n.language === 'ko' ? [
    '1분기 예산 검토', '스프린트 회고 노트', '고객 온보딩 체크리스트',
    '성과 리뷰 초안', '마케팅 캠페인 분석', '주간 현황 보고',
    '협력사 계약 검토', '팀 역량 계획', '리스크 평가 매트릭스',
    '이해관계자 발표자료', '프로젝트 일정 업데이트', '자원 배분 시트',
    '월간 KPI 대시보드', '교육 일정표', '컴플라이언스 감사 체크리스트',
    '재고 조정', '고객 피드백 요약', '직원 만족도 설문',
    '연간 매출 예측', '운영 효율 보고서', '채용 파이프라인 추적',
    'IT 인프라 감사', '출장비 보고서', '제품 로드맵 검토',
    '분기별 OKR 업데이트', '보안 컴플라이언스 검토', '브랜드 가이드 업데이트',
    '사무용품 재고', '회의실 일정표', '영업 퍼널 분석',
  ] : [
    'Q1 Budget Review', 'Sprint Retrospective Notes', 'Client Onboarding Checklist',
    'Performance Review Draft', 'Marketing Campaign Analysis', 'Weekly Status Update',
    'Vendor Contract Review', 'Team Capacity Planning', 'Risk Assessment Matrix',
    'Stakeholder Presentation', 'Project Timeline Update', 'Resource Allocation Sheet',
    'Monthly KPI Dashboard', 'Training Schedule', 'Compliance Audit Checklist',
    'Inventory Reconciliation', 'Customer Feedback Summary', 'Employee Satisfaction Survey',
    'Annual Revenue Forecast', 'Operational Efficiency Report', 'Hiring Pipeline Tracker',
    'IT Infrastructure Audit', 'Travel Expense Report', 'Product Roadmap Review',
    'Quarterly OKR Update', 'Security Compliance Review', 'Brand Guidelines Update',
    'Office Supply Inventory', 'Meeting Room Schedule', 'Sales Funnel Analysis',
  ];
}

let taskIndex = 0;
function nextTask(): string {
  const tasks = getFakeTasks();
  const task = tasks[taskIndex % tasks.length];
  taskIndex++;
  return task;
}

// ---------------------------------------------------------------------------
// Converters
// ---------------------------------------------------------------------------

export function sizeToPriority(size: BubbleSize): string {
  const isKo = i18n.language === 'ko';
  switch (size) {
    case 'S': return isKo ? '낮음' : 'Low';
    case 'M': return isKo ? '보통' : 'Medium';
    case 'L': return isKo ? '높음' : 'High';
    default: return isKo ? '보통' : 'Medium';
  }
}

function getColorCategories(): Record<string, string> {
  const isKo = i18n.language === 'ko';
  return {
    '#FFB5C2': isKo ? '마케팅' : 'Marketing',
    '#87CEEB': isKo ? '개발' : 'Engineering',
    '#98FB98': isKo ? '운영' : 'Operations',
    '#DDA0DD': isKo ? '디자인' : 'Design',
    '#FFD700': isKo ? '재무' : 'Finance',
    '#FFDAB9': isKo ? '영업' : 'Sales',
    '#F5F5F5': isKo ? '일반' : 'General',
    '#FF69B4': isKo ? '경영' : 'Executive',
  };
}

export function colorToCategory(color: string): string {
  const cats = getColorCategories();
  return cats[color] ?? (i18n.language === 'ko' ? '일반' : 'General');
}

export function patternToNotes(pattern: BubblePattern): string {
  switch (pattern) {
    case 'plain':
      return 'Standard';
    case 'spiral':
      return 'Recurring';
    case 'dots':
      return 'Flagged';
    case 'star':
      return 'Urgent';
    default:
      return '';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function actionToRow(action: ActionLogEntry): SpreadsheetRow {
  const time = formatTime(action.timestamp);

  switch (action.kind) {
    case 'blow':
      return {
        timestamp: time,
        status: 'NEW',
        assignee: action.userName,
        task: nextTask(),
        priority: sizeToPriority(action.size ?? 'M'),
        category: colorToCategory(action.color ?? '#87CEEB'),
        notes: patternToNotes(action.pattern ?? 'plain'),
      };
    case 'pop':
      return {
        timestamp: time,
        status: 'DONE',
        assignee: action.userName,
        task: nextTask(),
        priority: sizeToPriority(action.size ?? 'M'),
        category: colorToCategory(action.color ?? '#87CEEB'),
        notes: 'Completed',
      };
    case 'join':
      return {
        timestamp: time,
        status: 'ACTIVE',
        assignee: action.userName,
        task: 'Sprint Planning',
        priority: '-',
        category: '-',
        notes: 'Joined',
      };
    case 'leave':
      return {
        timestamp: time,
        status: 'ON HOLD',
        assignee: action.userName,
        task: 'Break',
        priority: '-',
        category: '-',
        notes: 'Away',
      };
    case 'expire':
      return {
        timestamp: time,
        status: 'CLOSED',
        assignee: action.userName,
        task: nextTask(),
        priority: '-',
        category: '-',
        notes: 'Auto-archived',
      };
    default:
      return {
        timestamp: time,
        status: 'INFO',
        assignee: action.userName,
        task: '-',
        priority: '-',
        category: '-',
        notes: '',
      };
  }
}

// ---------------------------------------------------------------------------
// Formula bar helpers
// ---------------------------------------------------------------------------

const FAKE_FORMULAS = [
  '=SUM(B2:B15)',
  '=VLOOKUP(A2,Sheet2!A:D,3,FALSE)',
  '=IF(D2="High",1,0)',
  '=COUNTIF(B:B,"DONE")',
  '=AVERAGE(E2:E50)',
  '=TODAY()-DATE(2026,1,1)',
  '=CONCATENATE(C2," - ",D2)',
  '=INDEX(A:A,MATCH(MAX(E:E),E:E,0))',
];

export function generateFakeFormula(row: number, col: string): string {
  if (row === 1) {
    // header row – just show the header text
    const headers: Record<string, string> = {
      A: 'Timestamp',
      B: 'Status',
      C: 'Assignee',
      D: 'Task',
      E: 'Priority',
      F: 'Category',
      G: 'Notes',
    };
    return headers[col] ?? '';
  }
  // return a realistic-looking formula
  const idx = (row + col.charCodeAt(0)) % FAKE_FORMULAS.length;
  return FAKE_FORMULAS[idx];
}

// ---------------------------------------------------------------------------
// Build initial action log from existing bubbles
// ---------------------------------------------------------------------------

export function bubbleToActionEntry(bubble: BubbleInfo): ActionLogEntry {
  return {
    id: bubble.bubbleId,
    timestamp: bubble.createdAt,
    kind: 'blow',
    userName: bubble.blownBy.displayName,
    bubbleId: bubble.bubbleId,
    size: bubble.size,
    color: bubble.color,
    pattern: bubble.pattern,
  };
}

// ---------------------------------------------------------------------------
// Size ↔ font-size mapping (for the disguised size selector)
// ---------------------------------------------------------------------------

export const SIZE_FONT_MAP: { size: BubbleSize; label: string }[] = [
  { size: 'S', label: '10' },
  { size: 'M', label: '12' },
  { size: 'L', label: '14' },
];

// ---------------------------------------------------------------------------
// Pattern ↔ border style mapping
// ---------------------------------------------------------------------------

export const PATTERN_BORDER_MAP: { pattern: BubblePattern; label: string; icon: string }[] = [
  { pattern: 'plain', label: 'No Border', icon: '▯' },
  { pattern: 'spiral', label: 'All Borders', icon: '▦' },
  { pattern: 'dots', label: 'Dotted', icon: '▤' },
  { pattern: 'star', label: 'Double', icon: '▩' },
];
