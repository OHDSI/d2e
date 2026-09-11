import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OverviewTable from './OverviewTable.vue';
import type { OverviewResults } from '../api/dqd';

/** Distinct numbers per cell so the assertions below pin the column order. */
function group(base: number, percentPass: string) {
  return {
    pass: base + 1,
    fail: base + 2,
    total: base + 3,
    percentPass,
  };
}

const data: OverviewResults = {
  verification: {
    plausibility: group(100, '95%'),
    conformance: group(200, '94%'),
    completeness: group(300, '93%'),
    total: group(400, '92%'),
  },
  validation: {
    plausibility: group(500, '37%'),
    conformance: group(600, '36%'),
    completeness: group(700, '35%'),
    total: group(800, '34%'),
  },
  total: {
    plausibility: group(900, '74%'),
    conformance: group(1000, '95%'),
    completeness: group(1100, '-'),
    total: {
      pass: 1221,
      fail: 237,
      total: 1458,
      percentPass: '88%',
      allNa: 12,
      allError: 3,
      PassMinusAllNA: 1209,
      totalMinusAllErrorMinusAllNA: 1443,
      correctedPassPercentage: '84%',
    },
  },
};

describe('OverviewTable', () => {
  it('renders one row per category, all-checks last', () => {
    const wrapper = mount(OverviewTable, { props: { data } });
    const labels = wrapper.findAll('tbody th').map((th) => th.text());
    expect(labels).toEqual(['Plausibility', 'Conformance', 'Completeness', 'Total']);
  });

  it('lays each row out as verification, validation then total', () => {
    const wrapper = mount(OverviewTable, { props: { data } });
    const cells = wrapper.findAll('tbody tr')[0].findAll('td').map((td) => td.text());
    expect(cells).toEqual([
      '101', '102', '103', '95%',
      '501', '502', '503', '37%',
      '901', '902', '903', '74%',
    ]);
  });

  it('formats the all-checks row and marks it as the total', () => {
    const wrapper = mount(OverviewTable, { props: { data } });
    const totalRow = wrapper.findAll('tbody tr')[3];
    expect(totalRow.classes()).toContain('dq-matrix__row--total');
    expect(totalRow.findAll('td').map((td) => td.text()).slice(-4)).toEqual([
      '1,221', '237', '1,458', '88%',
    ]);
  });

  it('shows N/A where a category has no checks', () => {
    const wrapper = mount(OverviewTable, { props: { data } });
    const completeness = wrapper.findAll('tbody tr')[2].findAll('td');
    expect(completeness[completeness.length - 1].text()).toBe('N/A');
  });

  it('spans the header over each context', () => {
    const wrapper = mount(OverviewTable, { props: { data } });
    const groups = wrapper.findAll('thead th[scope="colgroup"]');
    expect(groups.map((th) => th.text())).toEqual(['Verification', 'Validation', 'Total']);
    expect(groups.every((th) => th.attributes('colspan') === '4')).toBe(true);
    expect(wrapper.findAll('thead th[scope="col"]')).toHaveLength(12);
  });
});
