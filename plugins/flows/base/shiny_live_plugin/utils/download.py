import csv
import io
import re

from plotly.subplots import make_subplots

from style_utils import chart_text_style, dashboard_text_style, style_str


def _styled_span(text, font, font_family=None):
    style = style_str(font)
    if font_family:
        style += f";font-family:{font_family}"
    return f'<span style="{style}">{text}</span>'


def _wrap_plotly_text(text, font_size, max_width_px, char_width_factor=0.55):
    """Word-wraps a Plotly-flavoured HTML string (plain text plus simple
    <b>/<span> tags) to roughly fit max_width_px, inserting <br> between
    words once a line's estimated width would exceed it.

    Plotly titles/annotations are plain SVG text, not an HTML block, so -
    unlike the on-screen version of the same text - they never wrap on
    their own; a long, un-wrapped line just gets cut off at the image
    edges. Width is estimated from character count (font_size *
    char_width_factor per character) since there's no real text-measuring
    available at figure-build time.
    """
    if not text:
        return text
    space_width = font_size * char_width_factor
    lines = []
    current_words = []
    current_width = 0
    for word in text.split(" "):
        visible_word = re.sub(r"<[^>]+>", "", word)
        word_width = len(visible_word) * font_size * char_width_factor
        added_width = word_width + (space_width if current_words else 0)
        if current_words and current_width + added_width > max_width_px:
            lines.append(" ".join(current_words))
            current_words = [word]
            current_width = word_width
        else:
            current_words.append(word)
            current_width += added_width
    if current_words:
        lines.append(" ".join(current_words))
    return "<br>".join(lines)


_AXIS_FORMAT_KEYS = (
    "tickformat", "tickmode", "tick0", "dtick", "tickfont",
    "showgrid", "gridcolor", "rangemode", "showline", "linecolor",
    "automargin", "range",
)


def _axis_format_kwargs(axis):
    """Pulls the display-relevant (as opposed to structural/positioning)
    properties off a standalone chart's axis object, for copying onto its
    merged combined-figure subplot axis - add_trace only copies a chart's
    trace data, not its layout (see build_combined_figure's docstring), so a
    chart's own tick formatting (e.g. the readmission-rate axis's ".1%")
    would otherwise silently revert to Plotly's raw-number default."""
    if axis is None:
        return {}
    return {key: axis[key] for key in _AXIS_FORMAT_KEYS if axis[key] is not None}


def _title_html(title, subtitle, title_font, subtitle_font, font_family=None, max_width_px=None):
    """Combines a title and optional subtitle into one Plotly-flavoured HTML
    string (a styled first line plus a smaller styled second line) - reused
    for both the overall dashboard title and each chart's subplot title,
    since Plotly's subplot_titles/figure title are plain text/HTML, not
    something a separate subtitle field can be attached to.

    When max_width_px is given, title/subtitle are word-wrapped to fit it -
    see _wrap_plotly_text."""
    if max_width_px:
        title = _wrap_plotly_text(title, title_font["size"], max_width_px)
    text = _styled_span(title, title_font, font_family)
    if subtitle:
        if max_width_px:
            subtitle = _wrap_plotly_text(subtitle, subtitle_font["size"], max_width_px)
        text += f"<br>{_styled_span(subtitle, subtitle_font, font_family)}"
    return text


def build_combined_figure(chart_specs, cards=None, title=None, subtitle=None, row_heights=None,
                           vertical_spacing=0.1, font_family=None,
                           height=900, width=900, barmode=None):
    """Assembles a stacked subplot figure from an optional cards row plus a
    list of {"title", "subtitle", "build_fn", "secondary_y", "domain"} chart
    specs, with an optional overall title/subtitle.

    add_trace only copies a chart's trace data, not its layout, so each
    chart's own legend position/orientation would otherwise be lost. Instead,
    each chart's traces are assigned to their own named legend (Plotly's
    legend/legend2/legend3/... multi-legend support), re-anchored vertically
    centred to the right of that chart's own row via fig.get_subplot(), so
    every chart keeps a legend that's actually next to it.
    """
    specs = []
    subplot_titles = []

    if cards:
        specs.append([{"type": "xy"}])
        subplot_titles.append("")

    for chart in chart_specs:
        if chart.get("domain"):
            specs.append([{"type": "domain"}])
        elif chart.get("secondary_y"):
            specs.append([{"secondary_y": True}])
        else:
            specs.append([{}])
        subplot_titles.append(_title_html(
            chart["title"], chart.get("subtitle"),
            chart_text_style["title"]["font"], chart_text_style["subtitle"]["font"],
            font_family, max_width_px=max(200, width - 160),
        ))

    fig = make_subplots(
        rows=len(specs),
        cols=1,
        specs=specs,
        subplot_titles=subplot_titles,
        vertical_spacing=vertical_spacing,
        row_heights=row_heights,
    )

    # make_subplots centers each subplot_titles annotation over its own
    # column by default; re-anchor them to their subplot's left edge instead,
    # to match the dashboard's left-aligned header. The empty "" entry used
    # as the cards row's placeholder never produces an annotation, so these
    # line up 1:1, in order, with chart_specs.
    chart_row_start = 2 if cards else 1
    for i, chart in enumerate(chart_specs):
        subplot = fig.get_subplot(chart_row_start + i, 1)
        x0 = subplot.x[0] if chart.get("domain") else subplot.xaxis.domain[0]
        fig.layout.annotations[i].update(x=x0, xanchor="left", align="left")

    row = 1
    if cards:
        from style_utils import format_card_value

        card_width = 1 / len(cards)
        for i, card in enumerate(cards):
            x_center = (i + 0.5) * card_width
            fig.add_annotation(x=x_center, y=0.8, xref="x1", yref="y1", showarrow=False,
                                text=card["title"],
                                font=dict(family=font_family, size=14, color="#000080", weight=600))
            fig.add_annotation(x=x_center, y=0.5, xref="x1", yref="y1", showarrow=False,
                                text=format_card_value(card["value"]),
                                font=dict(family=font_family, size=26, color="#000000", weight=600))
            fig.add_annotation(x=x_center, y=0.2, xref="x1", yref="y1", showarrow=False,
                                text=card["description"],
                                font=dict(family=font_family, size=12, color="#000000"))
        fig.update_xaxes(visible=False, range=[0, 1], row=1, col=1)
        fig.update_yaxes(visible=False, range=[0, 1], row=1, col=1)
        row = 2

    legend_layouts = {}
    for chart in chart_specs:
        chart_fig = chart["build_fn"]()
        legend_ref = "legend" if row == 1 else f"legend{row}"
        subplot = fig.get_subplot(row, 1)
        y0, y1 = subplot.y if chart.get("domain") else subplot.yaxis.domain
        for trace in chart_fig.data:
            secondary_y = bool(chart.get("secondary_y")) and trace.yaxis == "y2"
            trace.legend = legend_ref
            fig.add_trace(trace, row=row, col=1, secondary_y=secondary_y)

        if not chart.get("domain"):
            primary_kwargs = _axis_format_kwargs(chart_fig.layout.xaxis)
            if primary_kwargs:
                fig.update_xaxes(row=row, col=1, **primary_kwargs)
            primary_kwargs = _axis_format_kwargs(chart_fig.layout.yaxis)
            if primary_kwargs:
                fig.update_yaxes(row=row, col=1, **primary_kwargs)
            if chart.get("secondary_y"):
                secondary_kwargs = _axis_format_kwargs(chart_fig.layout.yaxis2)
                if secondary_kwargs:
                    fig.update_yaxes(row=row, col=1, secondary_y=True, **secondary_kwargs)

        legend_layouts[legend_ref] = dict(
            orientation="v", xanchor="left", x=1.02,
            yanchor="middle", y=(y0 + y1) / 2,
            font=dict(family=font_family, size=12),
        )
        row += 1

    layout_kwargs = dict(height=height, width=width, showlegend=True, **legend_layouts)
    if font_family:
        layout_kwargs["font"] = dict(family=font_family)
    if barmode:
        layout_kwargs["barmode"] = barmode
    if title:
        title_font = dashboard_text_style["title"]["font"]
        subtitle_font = dashboard_text_style["description"]["font"]
        max_width_px = max(200, width - 160)

        wrapped_title = _wrap_plotly_text(title, title_font["size"], max_width_px)
        wrapped_subtitle = _wrap_plotly_text(subtitle, subtitle_font["size"], max_width_px) if subtitle else None

        text = _styled_span(wrapped_title, title_font, font_family)
        if wrapped_subtitle:
            text += f"<br>{_styled_span(wrapped_subtitle, subtitle_font, font_family)}"

        # x is left-anchored (instead of centered) to match the on-screen
        # dashboard header's left alignment, and offset to line up with the
        # charts' own left edge (their default ~80px left margin).
        layout_kwargs["title"] = dict(text=text, x=80 / width, xanchor="left")

        title_lines = wrapped_title.count("<br>") + 1
        subtitle_lines = wrapped_subtitle.count("<br>") + 1 if wrapped_subtitle else 0
        title_block_height = title_lines * title_font["size"] * 1.3 + subtitle_lines * subtitle_font["size"] * 1.3
        layout_kwargs.setdefault("margin", dict(t=int(60 + title_block_height)))
    fig.update_layout(**layout_kwargs)
    return fig


def build_combined_csv(sections, cards=None, title=None):
    """Writes an optional overall title, an optional cards table, and a list
    of section-writer callbacks (each given the csv.writer) into a single
    CSV string."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    if title:
        writer.writerow([title])
        writer.writerow([])

    if cards:
        writer.writerow(["Cards"])
        writer.writerow(["Title", "Value", "Description"])
        for card in cards:
            writer.writerow([card["title"], card["value"], card["description"]])
        writer.writerow([])

    for i, section in enumerate(sections):
        if i > 0:
            writer.writerow([])
        section(writer)

    return buffer.getvalue()


def write_year_metric_csv_section(writer, title, data):
    years = list(next(iter(data.values())).keys())
    writer.writerow([title])
    writer.writerow(["Metric", *years])
    for metric, values in data.items():
        writer.writerow([metric, *[values[year] for year in years]])


def write_category_csv_section(writer, title, data):
    writer.writerow([title])
    writer.writerow(["Category", "Value", "Percentage"])
    for category, entry in data.items():
        writer.writerow([category, entry["value"], entry["percentage"]])


def write_indexed_csv_section(writer, title, data):
    writer.writerow([title])
    writer.writerow(["Index", *list(next(iter(data.values())).keys())])
    for idx, entry in data.items():
        writer.writerow([idx, *entry.values()])


def write_dataframe_csv_section(writer, title, df, columns):
    """Writes a titled section containing the given dataframe columns."""
    writer.writerow([title])
    writer.writerow(columns)
    for _, row in df.iterrows():
        writer.writerow([row[col] for col in columns])