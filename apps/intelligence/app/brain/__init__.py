"""Preference brain: what a user eats, when, and how it relates to time, occasion and mood.

A rebuildable fold over signals (food orders, grocery orders, games, check-ins):
``orders`` keeps the evidence, ``facts`` summarises it, ``relations`` links
contexts to choices, ``scoring`` turns it into a recommendation score part.
"""
