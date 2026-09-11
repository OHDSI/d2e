<template>
  <div class="patientlist-control">
    <div ref="contextMenuRef">
      <dropDownMenu
        :target="contextMenuActive"
        boundariesElement="patientlist-control-wrapper"
        :parentContainer="this.menuParentElement"
        :subMenu="columnContextMenu"
        :opened="contextMenuVisible"
        :openParam="'firstItem'"
        @clickEv="contextMenuItemClick"
        @closeEv="contextMenuClose"
      ></dropDownMenu>
    </div>

    <div ref="tableContainerRef" style="padding-left: 10px; padding-right: 10px">
      <table ref="tableRef">
        <thead ref="tblHeaderParent" v-resize-table="onColumnResize">
          <tr>
            <!-- interaction header -->
            <th
              v-for="item in tableHeaders"
              :key="item"
              :colspan="item.children.length"
              :data-path="item.path"
              class="leftborder rightborder"
            >
              <div class="headerContainer">
                <div class="headerTextContent" style="font-weight: bold">{{ item.text }}</div>
                <div>
                  <!-- interaction context menu -->
                  <div class="btnColContext" @click="contextMenuOpen($event, item)">
                    <icon icon="overflow"></icon>
                  </div>
                </div>
                <div class="headerGrip">&nbsp;</div>
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <!-- attributes header -->
            <template v-for="item in tableHeaders">
              <th
                v-for="(attribute, index) in item.children"
                :style="colAttributeStyle(attribute.path)"
                :key="attribute.path"
                :data-path="attribute.path"
                :data-parent-path="attribute.parentPath"
                :class="interactionCellBorderClass(index, item.children.length)"
                :data-testid="`pa-patient-list-header-${attribute.text}`"
              >
                <div class="headerContainer">
                  <div class="headerAttributeTextContent" :title="item.text + ' - ' + attribute.text">
                    <span>{{ attribute.text }}</span>
                  </div>
                  <div>
                    <!-- attribute context menu -->
                    <div class="btnColContext" @click="contextMenuOpen($event, attribute)">
                      <icon icon="overflow"></icon>
                    </div>
                  </div>
                  <div class="headerGrip">&nbsp;</div>
                </div>
              </th>
            </template>
          </tr>
          <tr v-for="(row, index) in tableRows" :key="index">
            <template v-for="item in tableHeaders">
              <td
                v-for="(attribute, index) in item.children"
                :key="attribute.path"
                :class="interactionCellBorderClass(index, item.children.length)"
              >
                <div v-for="detail in row[attribute.parentPath]" :key="detail" class="cellContainer">
                  <div class="textContent row-item">
                    <div class="textContent row-item">
                      <component :is="cellComponent(detail, attribute)" :item="detail" :meta="attribute" />
                    </div>
                  </div>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script lang="ts">
import { mapActions, mapGetters, mapMutations } from 'vuex'
import icon from '../lib/ui/app-icon.vue'
import * as types from '../store/mutation-types'
import DropDownMenu from './DropDownMenu.vue'
import PatientListData from './PatientListData.vue'
import PatientListLinkData from './PatientListLinkData.vue'
import { isValidHttpUrl } from '../utils/urlUtils'

function hasProp(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

export default {
  name: 'patientListControl',
  props: {
    columns: {
      type: Array,
      default: [],
    },
    rows: {
      type: Array,
      default: [],
    },
    currentPage: {
      type: Number,
      default: 1,
    },
    pageSize: {
      type: Number,
      default: 20,
    },
    showLeftPane: {
      type: Boolean,
    },
  },
  mounted() {
    this.renderWidths()
    window.addEventListener('click', this.contextMenuCloseHandler)
  },
  beforeUnmount() {
    window.removeEventListener('click', this.contextMenuCloseHandler)
  },
  data() {
    return {
      tableHeaderColumnRowSpan: 1,
      columnContextMenu: [],
      contextMenuVisible: false,
      contextMenuActive: null,
      selectedColumn: '',
      minColumnWidth: 120,
      menuParentElement: {
        type: HTMLElement,
        default: null,
      },
    }
  },
  watch: {
    showLeftPane() {
      this.renderWidths()
    },
    columns() {
      // when columns are added, set widths
      this.populateColumnMenu()

      this.$nextTick(() => {
        this.renderWidths()
      })
    },
  },
  computed: {
    ...mapGetters(['getMriFrontendConfig', 'getText', 'getColumnSelectionMenuByPath', 'getColumnWidths']),
    tableHeaders() {
      const header = {}
      Object.keys(this.columns)
        .map(path => ({
          path,
          parentPath: this.getMriFrontendConfig.getInteractionInstancePath(path),
          text: this.getMriFrontendConfig.getAttributeByPath(path).getName(),
          link: this.getMriFrontendConfig.getAttributeByPath(path).getPatientListLink(),
        }))
        .reduce((dict, col) => {
          if (dict[col.parentPath]) {
            dict[col.parentPath].push(col)
          } else {
            dict[col.parentPath] = [col]
          }
          return dict
        }, header)

      return Object.keys(header).map(parent => ({
        path: parent,
        text:
          parent === 'patient'
            ? this.getText('MRI_PA_FILTERCARD_TITLE_BASIC_DATA')
            : this.getMriFrontendConfig.getPatientListConfig().getInteractionByPath(parent).name,
        colSpan: header[parent].length,
        children: header[parent],
      }))
    },
    tableColumns() {
      return Object.keys(this.columns)
        .sort()
        .map(path => ({
          path,
          parentPath: this.getMriFrontendConfig.getInteractionInstancePath(path),
          text: this.getMriFrontendConfig.getAttributeByPath(path).getName(),
        }))
    },
    tableRows() {
      const rows: any[] = this.rows.map(row => {
        const newRow = { patient: [{}], rowHeight: 1 }

        Object.keys(row).forEach(key => {
          if (Array.isArray(row[key])) {
            newRow[key] = [...row[key]]
            // get the interaction with the most no. of rows. This will be the height of the patient row
            newRow.rowHeight = newRow.rowHeight > row[key].length ? newRow.rowHeight : row[key].length
          } else {
            // build patient data array
            newRow.patient[0][key] = row[key]
          }
        })

        return newRow
      })
      return rows
    },
  },
  methods: {
    ...mapActions(['populateColumnMenu', 'setColumnWidths']),
    // Render a cell as a new-tab link when it is configured as a link column
    // or its value is a valid http(s) URL; otherwise render plain text.
    cellComponent(detail, attribute) {
      const value = detail ? detail[attribute.path] : null
      return attribute.link || isValidHttpUrl(value) ? 'patientListLinkData' : 'patientListData'
    },
    ...mapMutations([types.PL_REMOVE_SELECTED_ATTRIBUTE]),
    renderWidths() {
      const columnWidths = this.computeBaseWidth(this.tableColumns)
      this.setContainerWidth(this.computeContainerWidth(columnWidths))
      this.setColumnWidths({
        ...columnWidths,
      })
    },
    interactionCellBorderClass(attributeIndex, attributeLength) {
      return `${attributeIndex === 0 ? 'leftborder' : ''} ${
        attributeIndex === attributeLength - 1 ? 'rightborder' : ''
      }`
    },
    colAttributeStyle(path) {
      return `width: ${this.getColumnWidths[path]}px;`
    },
    goPage(page) {
      this.$emit('goPage', page)
    },
    getColumnName(path) {
      return this.getMriFrontendConfig.getAttributeByPath(path).getName()
    },
    onColumnResize(el: HTMLElement) {
      const key = el.getAttribute('data-path')
      const parentPath = el.getAttribute('data-parent-path')
      const oldWidth = this.getColumnWidths[key]
      const newWidth = el.getBoundingClientRect().width

      this.setColumnWidths({
        [key]: newWidth,
      })

      // if child width was changed, update parent width
      if (parentPath) {
        this.setColumnWidths({
          [parentPath]: this.tableColumns.reduce((sum, col) => {
            if (col.parentPath === parentPath) {
              return sum + this.getColumnWidths[col.path]
            }
            return sum
          }, 0),
        })
      }
    },
    hasRows(item, meta) {
      return hasProp(item, meta.parentPath) && Array.isArray(item[meta.parentPath])
    },
    contextMenuCloseHandler() {
      if (
        this.contextMenuVisible &&
        !this.$refs.contextMenuRef.contains(event.target) &&
        !(event.target as any).parentElement.classList.contains('btnColContext')
      ) {
        this.contextMenuClose()
      }
    },
    contextMenuClose() {
      this.contextMenuVisible = false
    },
    contextMenuOpen(event, item) {
      this.selectedColumn = item
      this.contextMenuVisible = true
      this.contextMenuActive = event.target
      const sourceEvent = event || window.event

      this.menuParentElement = this.$el.parentElement

      if (sourceEvent.clientX || sourceEvent.clientY) {
        this.menuOpenParameter = ''
      } else {
        this.$nextTick(() => {
          this.menuOpenParameter = 'firstItem'
        })
      }

      sourceEvent.currentTarget.parentNode.insertBefore(
        this.$refs.contextMenuRef,
        sourceEvent.currentTarget.nextSibling
      )

      this.columnContextMenu = this.initColumnContextMenu(item.path, {
        hasSorting: item.parentPath === 'patient',
        isParent: !item.parentPath,
      })
      event.preventDefault()
    },
    removeAttribute(configPath) {
      this.$emit('removeColumn', {
        configPath,
      })
      this.$emit('refreshColumnMenu')
    },
    contextMenuItemClick(action) {
      if (typeof action === 'object') {
        this.$emit('addColumn', action)
      } else {
        switch (action) {
          case 'A':
          case 'D':
            this.$emit('sort', {
              sortOrder: action,
              configPath: this.selectedColumn.path,
            })
            break
          case 'REMOVE_INTERACTION':
            this.$emit('toggleInteraction', {
              path: this.selectedColumn.path,
              selected: false,
            })
            this.$emit('refreshColumnMenu')
            break
          case 'REMOVE_ATTRIBUTE':
            this.$emit('removeColumn', {
              configPath: this.selectedColumn.path,
            })
            this.$emit('refreshColumnMenu')
            break
          default:
            return
        }
      }
      this.contextMenuClose()
    },
    computeContainerWidth(columnWidths) {
      return this.tableColumns.reduce((sum, header) => {
        return sum + columnWidths[header.path]
      }, 0)
    },
    computeBaseWidth(columns) {
      const containerWidth = this.$refs.tableContainerRef.parentElement.getBoundingClientRect().width - 20
      const widths = { ...this.getColumnWidths }
      let colWidth = containerWidth / columns.length
      colWidth = colWidth < this.minColumnWidth ? this.minColumnWidth : colWidth
      columns.forEach(col => {
        // set initial width
        widths[col.path] = colWidth
        if (widths?.[col.parentPath]) {
          widths[col.parentPath] += colWidth
        } else {
          widths[col.parentPath] = colWidth
        }
      })
      return widths
    },
    setContainerWidth(width: number) {
      this.$refs.tableContainerRef.style.width = `${width}px`
    },
    initColumnContextMenu(path, options) {
      const menuData = []
      let menuIdx = -1

      if (options.hasSorting) {
        menuData.push({
          idx: (menuIdx += 1),
          subMenuStyle: {},
          icon: 'sortAscending',
          text: this.getText('MRI_PA_COL_SORT_ASC'),
          hasSubMenu: false,
          isSeperator: false,
          subMenu: [],
          disabled: false,
          data: 'A',
        })

        menuData.push({
          idx: (menuIdx += 1),
          subMenuStyle: {},
          icon: 'sortDescending',
          text: this.getText('MRI_PA_COL_SORT_DESC'),
          hasSubMenu: false,
          isSeperator: false,
          subMenu: [],
          disabled: false,
          data: 'D',
        })
      }

      if (options.isParent) {
        menuData.push({
          idx: (menuIdx += 1),
          subMenuStyle: {},
          text: this.getText('MRI_PA_PATIENT_LIST_ADD_ATTRIBUTE'),
          hasSubMenu: true,
          isSeperator: false,
          subMenu: [...this.getColumnSelectionMenuByPath(path).subMenu],
          disabled: false,
        })
      }

      if (options.isParent && path !== 'patient') {
        menuData.push({
          idx: (menuIdx += 1),
          subMenuStyle: {},
          text: this.getText('MRI_PA_COL_REMOVE'),
          hasSubMenu: false,
          isSeperator: false,
          subMenu: [],
          disabled: false,
          data: 'REMOVE_INTERACTION',
        })
      } else if (!options.isParent) {
        // if patient attribute and there is only 1 attribute visible in the screen, disable remove
        const patientCol = this.tableColumns.find(col => col.path === path && col.parentPath === 'patient')
        if (patientCol) {
          const patientHeader = this.tableHeaders.find(header => header.path === 'patient')
          if (patientHeader && patientHeader.children.length > 1) {
            menuData.push({
              idx: (menuIdx += 1),
              subMenuStyle: {},
              text: this.getText('MRI_PA_COL_REMOVE'),
              hasSubMenu: false,
              isSeperator: false,
              subMenu: [],
              disabled: false,
              data: 'REMOVE_ATTRIBUTE',
            })
          }
        } else {
          // always show remove attribute option for non patient columns
          menuData.push({
            idx: (menuIdx += 1),
            subMenuStyle: {},
            text: this.getText('MRI_PA_COL_REMOVE'),
            hasSubMenu: false,
            isSeperator: false,
            subMenu: [],
            disabled: false,
            data: 'REMOVE_ATTRIBUTE',
          })
        }
      }

      return menuData
    },
  },
  components: {
    icon,
    DropDownMenu,
    PatientListData,
    PatientListLinkData,
  },
}
</script>
